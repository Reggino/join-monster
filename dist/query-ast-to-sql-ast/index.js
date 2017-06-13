'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

exports.queryASTToSqlAST = queryASTToSqlAST;
exports.populateASTNode = populateASTNode;
exports.pruneDuplicateSqlDeps = pruneDuplicateSqlDeps;

var _assert = require('assert');

var _assert2 = _interopRequireDefault(_assert);

var _lodash = require('lodash');

var _aliasNamespace = require('../alias-namespace');

var _aliasNamespace2 = _interopRequireDefault(_aliasNamespace);

var _util = require('../util');

var _deprecate = require('deprecate');

var _deprecate2 = _interopRequireDefault(_deprecate);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const TABLE_TYPES = ['GraphQLObjectType', 'GraphQLUnionType', 'GraphQLInterfaceType'];

function queryASTToSqlAST(resolveInfo, options, context) {
  const namespace = new _aliasNamespace2.default(options.dialect === 'oracle' ? true : options.minify);

  const sqlAST = {};

  const fieldNodes = resolveInfo.fieldNodes || resolveInfo.fieldASTs;
  _assert2.default.equal(fieldNodes.length, 1, 'We thought this would always have a length of 1. FIX ME!!');

  const queryAST = fieldNodes[0];

  const parentType = resolveInfo.parentType;
  populateASTNode.call(resolveInfo, queryAST, parentType, sqlAST, namespace, 0, options, context);

  _assert2.default.equal(sqlAST.type, 'table', 'Must call joinMonster in a resolver on a field where the type is decorated with "sqlTable".');

  pruneDuplicateSqlDeps(sqlAST, namespace);

  return sqlAST;
}

function populateASTNode(queryASTNode, parentTypeNode, sqlASTNode, namespace, depth, options, context) {
  const fieldName = queryASTNode.name.value;

  if (/^__/.test(fieldName)) {
    sqlASTNode.type = 'noop';
    return;
  }

  let field = parentTypeNode._fields[fieldName];
  if (!field) {
    throw new Error(`The field "${fieldName}" is not in the ${parentTypeNode.name} type.`);
  }

  if (field.jmIgnoreAll) {
    sqlASTNode.type = 'noop';
    return;
  }

  let grabMany = false;

  let gqlType = stripNonNullType(field.type);

  if (queryASTNode.arguments.length) {
    const args = sqlASTNode.args = {};
    for (let arg of queryASTNode.arguments) {
      args[arg.name.value] = parseArgValue(arg.value, this.variableValues);
    }
  }

  if (gqlType.constructor.name === 'GraphQLList') {
    gqlType = stripNonNullType(gqlType.ofType);
    grabMany = true;
  }

  if (gqlType.constructor.name === 'GraphQLObjectType' && gqlType._fields.edges && gqlType._fields.pageInfo) {
    grabMany = true;

    const stripped = stripRelayConnection(gqlType, queryASTNode, this.fragments);

    gqlType = stripped.gqlType;
    queryASTNode = stripped.queryASTNode;

    if (field.sqlPaginate) {
      sqlASTNode.paginate = true;
      getSortColumns(field, sqlASTNode, context);
    }
  } else {
    if (field.sqlPaginate) {
      throw new Error(`To paginate the ${gqlType.name} type, it must be a GraphQLObjectType that fulfills the relay spec. The type must have a "pageInfo" and "edges" field. https://facebook.github.io/relay/graphql/connections.htm`);
    }
  }

  const config = gqlType._typeConfig;

  if (!field.jmIgnoreTable && TABLE_TYPES.includes(gqlType.constructor.name) && config.sqlTable) {
    if (depth >= 1) {
      (0, _assert2.default)(field.sqlJoin || field.sqlBatch || field.junctionTable, `If an Object type maps to a SQL table and has a child which is another Object type that also maps to a SQL table, you must define "sqlJoin", "sqlBatch", or "junctionTable" on that field to tell joinMonster how to fetch it. Or you can ignore it with "jmIgnoreTable". Check the "${fieldName}" field on the "${parentTypeNode.name}" type.`);
    }
    handleTable.call(this, sqlASTNode, queryASTNode, field, gqlType, namespace, grabMany, depth, options, context);
  } else if (field.sqlExpr) {
    sqlASTNode.type = 'expression';
    sqlASTNode.sqlExpr = field.sqlExpr;
    let aliasFrom = sqlASTNode.fieldName = field.name;
    if (sqlASTNode.defferedFrom) {
      aliasFrom += '@' + parentTypeNode.name;
    }
    sqlASTNode.as = namespace.generate('column', aliasFrom);
  } else if (field.sqlColumn || !field.resolve) {
    sqlASTNode.type = 'column';
    sqlASTNode.name = field.sqlColumn || field.name;
    let aliasFrom = sqlASTNode.fieldName = field.name;
    if (sqlASTNode.defferedFrom) {
      aliasFrom += '@' + parentTypeNode.name;
    }
    sqlASTNode.as = namespace.generate('column', aliasFrom);
  } else if (field.sqlDeps) {
    sqlASTNode.type = 'columnDeps';
    sqlASTNode.names = field.sqlDeps;
  } else {
    sqlASTNode.type = 'noop';
  }
}

function handleTable(sqlASTNode, queryASTNode, field, gqlType, namespace, grabMany, depth, options, context) {
  const config = gqlType._typeConfig;

  sqlASTNode.type = 'table';
  let sqlTable = config.sqlTable;
  if (typeof sqlTable === 'function') {
    sqlTable = sqlTable(sqlASTNode.args || {}, context);
  }
  sqlASTNode.name = sqlTable;

  sqlASTNode.as = namespace.generate('table', field.name);

  if (field.orderBy && !sqlASTNode.orderBy) {
    handleOrderBy(sqlASTNode, field, context);
  }

  const children = sqlASTNode.children = sqlASTNode.children || [];

  sqlASTNode.fieldName = field.name;
  sqlASTNode.grabMany = grabMany;

  if (field.where) {
    sqlASTNode.where = field.where;
  }

  if (field.sqlJoin) {
    sqlASTNode.sqlJoin = field.sqlJoin;
  } else if (field.junctionTable || field.joinTable) {
    (0, _assert2.default)(field.sqlJoins || field.junctionBatch, 'Must define `sqlJoins` (plural) or `junctionBatch` for a many-to-many.');
    if (field.joinTable) {
      (0, _deprecate2.default)('The `joinTable` is deprecated. Rename to `junctionTable`.');
    }
    const junctionTable = field.junctionTable || field.joinTable;
    sqlASTNode.junctionTable = junctionTable;

    sqlASTNode.junctionTableAs = namespace.generate('table', junctionTable);

    if (field.sqlJoins) {
      sqlASTNode.sqlJoins = field.sqlJoins;
    } else {
      children.push(_extends({}, keyToASTChild(field.junctionTableKey, namespace), {
        fromOtherTable: sqlASTNode.junctionTableAs
      }));
      sqlASTNode.junctionBatch = {
        sqlJoin: field.junctionBatch.sqlJoin,
        thisKey: _extends({}, columnToASTChild(field.junctionBatch.thisKey, namespace), {
          fromOtherTable: sqlASTNode.junctionTableAs
        }),
        parentKey: columnToASTChild(field.junctionBatch.parentKey, namespace)
      };
    }
  } else if (field.sqlBatch) {
    sqlASTNode.sqlBatch = {
      thisKey: columnToASTChild(field.sqlBatch.thisKey, namespace),
      parentKey: columnToASTChild(field.sqlBatch.parentKey, namespace)
    };
  }

  if (!config.uniqueKey) {
    throw new Error(`You must specify the "uniqueKey" on the GraphQLObjectType definition of ${sqlTable}`);
  }
  children.push(keyToASTChild(config.uniqueKey, namespace));

  if (config.alwaysFetch) {
    for (let column of (0, _util.wrap)(config.alwaysFetch)) {
      children.push(columnToASTChild(column, namespace));
    }
  }

  if (config.typeHint && ['GraphQLUnionType', 'GraphQLInterfaceType'].includes(gqlType.constructor.name)) {
    (0, _deprecate2.default)('`typeHint` is deprecated. Use `alwaysFetch` instead.');
    children.push(columnToASTChild(config.typeHint, namespace));
  }

  if (sqlASTNode.paginate) {
    handleColumnsRequiredForPagination(sqlASTNode, namespace);
  }

  if (queryASTNode.selectionSet) {
    if (gqlType.constructor.name === 'GraphQLUnionType' || gqlType.constructor.name === 'GraphQLInterfaceType') {
      sqlASTNode.type = 'union';
      sqlASTNode.typedChildren = {};
      handleUnionSelections.call(this, sqlASTNode, children, queryASTNode.selectionSet.selections, gqlType, namespace, depth, options, context);
    } else {
      handleSelections.call(this, sqlASTNode, children, queryASTNode.selectionSet.selections, gqlType, namespace, depth, options, context);
    }
  }
}

function handleUnionSelections(sqlASTNode, children, selections, gqlType, namespace, depth, options, context, internalOptions = {}) {
  for (let selection of selections) {
    switch (selection.kind) {
      case 'Field':
        const existingNode = children.find(child => child.fieldName === selection.name.value && child.type === 'table');
        let newNode = {};
        if (existingNode) {
          newNode = existingNode;
        } else {
          children.push(newNode);
        }
        if (internalOptions.defferedFrom) {
          newNode.defferedFrom = internalOptions.defferedFrom;
        }
        populateASTNode.call(this, selection, gqlType, newNode, namespace, depth + 1, options, context);
        break;

      case 'InlineFragment':
        {
          const selectionNameOfType = selection.typeCondition.name.value;

          const deferredType = this.schema._typeMap[selectionNameOfType];
          const deferToObjectType = deferredType.constructor.name === 'GraphQLObjectType';
          const handler = deferToObjectType ? handleSelections : handleUnionSelections;
          if (deferToObjectType) {
            const typedChildren = sqlASTNode.typedChildren;
            children = typedChildren[deferredType.name] = typedChildren[deferredType.name] || [];
            internalOptions.defferedFrom = gqlType;
          }
          handler.call(this, sqlASTNode, children, selection.selectionSet.selections, deferredType, namespace, depth, options, context, internalOptions);
        }
        break;

      case 'FragmentSpread':
        {
          const fragmentName = selection.name.value;
          const fragment = this.fragments[fragmentName];
          const fragmentNameOfType = fragment.typeCondition.name.value;
          const deferredType = this.schema._typeMap[fragmentNameOfType];
          const deferToObjectType = deferredType.constructor.name === 'GraphQLObjectType';
          const handler = deferToObjectType ? handleSelections : handleUnionSelections;
          if (deferToObjectType) {
            const typedChildren = sqlASTNode.typedChildren;
            children = typedChildren[deferredType.name] = typedChildren[deferredType.name] || [];
            internalOptions.defferedFrom = gqlType;
          }
          handler.call(this, sqlASTNode, children, fragment.selectionSet.selections, deferredType, namespace, depth, options, context, internalOptions);
        }
        break;
      default:
        throw new Error('Unknown selection kind: ' + selection.kind);
    }
  }
}

function handleSelections(sqlASTNode, children, selections, gqlType, namespace, depth, options, context, internalOptions = {}) {
  for (let selection of selections) {
    switch (selection.kind) {
      case 'Field':
        const existingNode = children.find(child => child.fieldName === selection.name.value && child.type === 'table');
        let newNode = {};
        if (existingNode) {
          newNode = existingNode;
        } else {
          children.push(newNode);
        }
        if (internalOptions.defferedFrom) {
          newNode.defferedFrom = internalOptions.defferedFrom;
        }
        populateASTNode.call(this, selection, gqlType, newNode, namespace, depth + 1, options, context);
        break;

      case 'InlineFragment':
        {
          const selectionNameOfType = selection.typeCondition.name.value;
          const sameType = selectionNameOfType === gqlType.name;
          const interfaceType = (gqlType._interfaces || []).map(iface => iface.name).includes(selectionNameOfType);
          if (sameType || interfaceType) {
            handleSelections.call(this, sqlASTNode, children, selection.selectionSet.selections, gqlType, namespace, depth, options, context, internalOptions);
          }
        }
        break;

      case 'FragmentSpread':
        {
          const fragmentName = selection.name.value;
          const fragment = this.fragments[fragmentName];

          const fragmentNameOfType = fragment.typeCondition.name.value;
          const sameType = fragmentNameOfType === gqlType.name;
          const interfaceType = gqlType._interfaces.map(iface => iface.name).indexOf(fragmentNameOfType) >= 0;
          if (sameType || interfaceType) {
            handleSelections.call(this, sqlASTNode, children, fragment.selectionSet.selections, gqlType, namespace, depth, options, context, internalOptions);
          }
        }
        break;
      default:
        throw new Error('Unknown selection kind: ' + selection.kind);
    }
  }
}

function columnToASTChild(columnName, namespace) {
  return {
    type: 'column',
    name: columnName,
    fieldName: columnName,
    as: namespace.generate('column', columnName)
  };
}

function toClumsyName(keyArr) {
  return keyArr.map(name => name.slice(0, 3)).join('#');
}

function keyToASTChild(key, namespace) {
  if (typeof key === 'string') {
    return {
      type: 'column',
      name: key,
      fieldName: key,
      as: namespace.generate('column', key)
    };
  } else if (Array.isArray(key)) {
    const clumsyName = toClumsyName(key);
    return {
      type: 'composite',
      name: key,
      fieldName: clumsyName,
      as: namespace.generate('column', clumsyName)
    };
  }
}

function handleColumnsRequiredForPagination(sqlASTNode, namespace) {
  if (sqlASTNode.sortKey) {
    (0, _assert2.default)(sqlASTNode.sortKey.key, '"sortKey" must have "key"');
    (0, _assert2.default)(sqlASTNode.sortKey.order, '"sortKey" must have "order"');

    for (let column of (0, _util.wrap)(sqlASTNode.sortKey.key)) {
      const newChild = {
        type: 'column',
        name: column,
        fieldName: column,
        as: namespace.generate('column', column)
      };

      if (sqlASTNode.junctionTable) {
        newChild.fromOtherTable = sqlASTNode.junctionTableAs;
      }
      sqlASTNode.children.push(newChild);
    }
  } else if (sqlASTNode.orderBy) {
    const newChild = {
      type: 'column',
      name: '$total',
      fieldName: '$total',
      as: namespace.generate('column', '$total')
    };
    if (sqlASTNode.junctionTable) {
      newChild.fromOtherTable = sqlASTNode.junctionTableAs;
    }
    sqlASTNode.children.push(newChild);
  }
}

function stripRelayConnection(gqlType, queryASTNode, fragments) {
  const strippedType = gqlType._fields.edges.type.ofType._fields.node.type;

  const args = queryASTNode.arguments;

  const edges = spreadFragments(queryASTNode.selectionSet.selections, fragments, gqlType.name).find(selection => selection.name.value === 'edges');
  if (edges) {
    queryASTNode = spreadFragments(edges.selectionSet.selections, fragments, gqlType.name).find(selection => selection.name.value === 'node') || {};
  } else {
    queryASTNode = {};
  }

  queryASTNode.arguments = args;
  return { gqlType: strippedType, queryASTNode };
}

function stripNonNullType(type) {
  return type.constructor.name === 'GraphQLNonNull' ? type.ofType : type;
}

function pruneDuplicateSqlDeps(sqlAST, namespace) {
  const childrenToLoopOver = [];
  if (sqlAST.children) {
    childrenToLoopOver.push(sqlAST.children);
  }
  if (sqlAST.typedChildren) {
    childrenToLoopOver.push(...Object.values(sqlAST.typedChildren));
  }

  for (let children of childrenToLoopOver) {
    const deps = new Set();

    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child.type === 'columnDeps') {
        child.names.forEach(name => deps.add(name));
        children.splice(i, 1);
      } else if (child.type === 'table' || child.type === 'union') {
        pruneDuplicateSqlDeps(child, namespace);
      }
    }

    const newNode = {
      type: 'columnDeps',
      names: {}
    };
    deps.forEach(name => {
      newNode.names[name] = namespace.generate('column', name);
    });
    children.push(newNode);
  }
}

function parseArgValue(value, variableValues) {
  if (value.kind === 'Variable') {
    const variableName = value.name.value;
    return variableValues[variableName];
  }

  switch (value.kind) {
    case 'IntValue':
      return parseInt(value.value);
    case 'FloatValue':
      return parseFloat(value.value);
    case 'ListValue':
      return value.values.map(value => parseArgValue(value, variableValues));
    case 'ObjectValue':
      return value.fields.map(value => parseArgValue(value, variableValues));
    case 'ObjectField':
      return { name: value.name.value, value: parseArgValue(value.value, variableValues) };
    default:
      return value.value;
  }
}

function getSortColumns(field, sqlASTNode, context) {
  if (field.sortKey) {
    if (typeof field.sortKey === 'function') {
      sqlASTNode.sortKey = field.sortKey(sqlASTNode.args, context);
    } else {
      sqlASTNode.sortKey = field.sortKey;
    }
  } else if (field.orderBy) {
    handleOrderBy(sqlASTNode, field, context);
  } else {
    throw new Error('"sortKey" or "orderBy" required if "sqlPaginate" is true');
  }
}

function handleOrderBy(sqlASTNode, field, context) {
  if (typeof field.orderBy === 'function') {
    sqlASTNode.orderBy = field.orderBy(sqlASTNode.args || {}, context);
  } else {
    sqlASTNode.orderBy = field.orderBy;
  }
}

function spreadFragments(selections, fragments, typeName) {
  return (0, _lodash.flatMap)(selections, selection => {
    switch (selection.kind) {
      case 'FragmentSpread':
        const fragmentName = selection.name.value;
        const fragment = fragments[fragmentName];
        return spreadFragments(fragment.selectionSet.selections, fragments, typeName);
      case 'InlineFragment':
        if (selection.typeCondition.name.value === typeName) {
          return spreadFragments(selection.selectionSet.selections, fragments, typeName);
        } else {
          return [];
        }
      default:
        return selection;
    }
  });
}