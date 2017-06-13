'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

let _stringifySqlAST = (() => {
  var _ref2 = _asyncToGenerator(function* (parent, node, prefix, context, selections, tables, wheres, orders, batchScope, dialect) {
    const { quote: q } = dialect;
    switch (node.type) {
      case 'table':
        yield handleTable(parent, node, prefix, context, selections, tables, wheres, orders, batchScope, dialect);

        if ((0, _shared.thisIsNotTheEndOfThisBatch)(node, parent)) {
          for (let child of node.children) {
            yield _stringifySqlAST(node, child, [...prefix, node.as], context, selections, tables, wheres, orders, null, dialect);
          }
        }

        break;
      case 'union':
        yield handleTable(parent, node, prefix, context, selections, tables, wheres, orders, batchScope, dialect);

        if ((0, _shared.thisIsNotTheEndOfThisBatch)(node, parent)) {
          for (let typeName in node.typedChildren) {
            for (let child of node.typedChildren[typeName]) {
              yield _stringifySqlAST(node, child, [...prefix, node.as], context, selections, tables, wheres, orders, null, dialect);
            }
          }
          for (let child of node.children) {
            yield _stringifySqlAST(node, child, [...prefix, node.as], context, selections, tables, wheres, orders, null, dialect);
          }
        }

        break;
      case 'column':
        selections.push(`${q(node.fromOtherTable || parent.as)}.${q(node.name)} AS ${q((0, _shared.joinPrefix)(prefix) + node.as)}`);
        break;
      case 'columnDeps':
        for (let name in node.names) {
          selections.push(`${q(parent.as)}.${q(name)} AS ${q((0, _shared.joinPrefix)(prefix) + node.names[name])}`);
        }
        break;
      case 'composite':
        const parentTable = node.fromOtherTable || parent.as;
        selections.push(`${dialect.compositeKey(parentTable, node.name)} AS ${q((0, _shared.joinPrefix)(prefix) + node.as)}`);
        break;
      case 'expression':
        const expr = yield node.sqlExpr(`${q(parent.as)}`, node.args || {}, context, (0, _shared.quotePrefix)(prefix, q));
        selections.push(`${expr} AS ${q((0, _shared.joinPrefix)(prefix) + node.as)}`);
        break;
      case 'noop':
        return;
      default:
        throw new Error('unexpected/unknown node type reached: ' + (0, _util.inspect)(node));
    }
    return { selections, tables, wheres, orders };
  });

  return function _stringifySqlAST(_x4, _x5, _x6, _x7, _x8, _x9, _x10, _x11, _x12, _x13) {
    return _ref2.apply(this, arguments);
  };
})();

let handleTable = (() => {
  var _ref3 = _asyncToGenerator(function* (parent, node, prefix, context, selections, tables, wheres, orders, batchScope, dialect) {
    const { quote: q } = dialect;

    if (node.where && (0, _shared.whereConditionIsntSupposedToGoInsideSubqueryOrOnNextBatch)(node, parent)) {
      wheres.push((yield node.where(`${q(node.as)}`, node.args || {}, context, (0, _shared.quotePrefix)(prefix, q))));
    }

    if (!node.paginate && node.orderBy && (0, _shared.thisIsNotTheEndOfThisBatch)(node, parent)) {
      orders.push({
        table: node.as,
        columns: (0, _shared.handleOrderBy)(node.orderBy)
      });
    }

    if (node.sqlJoin) {
      const joinCondition = yield node.sqlJoin(`${q(parent.as)}`, q(node.as), node.args || {}, context);

      if (node.paginate) {
        yield dialect.handleJoinedOneToManyPaginated(parent, node, prefix, context, selections, tables, wheres, orders, joinCondition);
      } else {
        tables.push(`LEFT JOIN ${node.name} ${q(node.as)} ON ${joinCondition}`);
      }
    } else if (node.junctionTable && node.junctionBatch) {
      if (parent) {
        selections.push(`${q(parent.as)}.${q(node.junctionBatch.parentKey.name)} AS ${q((0, _shared.joinPrefix)(prefix) + node.junctionBatch.parentKey.as)}`);
      } else {
        const joinCondition = yield node.junctionBatch.sqlJoin(`${q(node.junctionTableAs)}`, q(node.as), node.args || {}, context);
        if (node.paginate) {
          yield dialect.handleBatchedManyToManyPaginated(parent, node, prefix, context, selections, tables, wheres, orders, batchScope, joinCondition);
        } else {
          tables.push(`FROM ${node.junctionTable} ${q(node.junctionTableAs)}`, `LEFT JOIN ${node.name} ${q(node.as)} ON ${joinCondition}`);

          wheres.push(`${q(node.junctionTableAs)}.${q(node.junctionBatch.thisKey.name)} IN (${batchScope.join(',')})`);
        }
      }
    } else if (node.junctionTable) {
      (0, _assert2.default)(node.sqlJoins, 'Must set "sqlJoins" for a join table.');
      const joinCondition1 = yield node.sqlJoins[0](`${q(parent.as)}`, q(node.junctionTableAs), node.args || {}, context);
      const joinCondition2 = yield node.sqlJoins[1](`${q(node.junctionTableAs)}`, q(node.as), node.args || {}, context);

      if (node.paginate) {
        yield dialect.handleJoinedManyToManyPaginated(parent, node, prefix, context, selections, tables, wheres, orders, joinCondition1);
      } else {
        tables.push(`LEFT JOIN ${node.junctionTable} ${q(node.junctionTableAs)} ON ${joinCondition1}`);
      }
      tables.push(`LEFT JOIN ${node.name} ${q(node.as)} ON ${joinCondition2}`);
    } else if (node.sqlBatch) {
      if (parent) {
        selections.push(`${q(parent.as)}.${q(node.sqlBatch.parentKey.name)} AS ${q((0, _shared.joinPrefix)(prefix) + node.sqlBatch.parentKey.as)}`);
      } else {
        if (node.paginate) {
          yield dialect.handleBatchedOneToManyPaginated(parent, node, prefix, context, selections, tables, wheres, orders, batchScope);
        } else {
          tables.push(`FROM ${node.name} ${q(node.as)}`);
          wheres.push(`${q(node.as)}.${q(node.sqlBatch.thisKey.name)} IN (${batchScope.join(',')})`);
        }
      }
    } else if (node.paginate) {
      yield dialect.handlePaginationAtRoot(parent, node, prefix, context, selections, tables, wheres, orders);
    } else {
      (0, _assert2.default)(!parent, `Object type for "${node.fieldName}" table must have a "sqlJoin" or "sqlBatch"`);
      tables.push(`FROM ${node.name} ${q(node.as)}`);
    }
  });

  return function handleTable(_x14, _x15, _x16, _x17, _x18, _x19, _x20, _x21, _x22, _x23) {
    return _ref3.apply(this, arguments);
  };
})();

var _assert = require('assert');

var _assert2 = _interopRequireDefault(_assert);

var _lodash = require('lodash');

var _util = require('../util');

var _shared = require('./shared');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

exports.default = (() => {
  var _ref = _asyncToGenerator(function* (topNode, context, options) {
    (0, _util.validateSqlAST)(topNode);

    const dialect = require('./dialects/' + options.dialect);

    let { selections, tables, wheres, orders } = yield _stringifySqlAST(null, topNode, [], context, [], [], [], [], options.batchScope, dialect);

    selections = [...new Set(selections)];

    if (!selections.length) return '';

    let sql = 'SELECT\n  ' + selections.join(',\n  ') + '\n' + tables.join('\n');

    wheres = (0, _lodash.filter)(wheres);
    if (wheres.length) {
      sql += '\nWHERE ' + wheres.join(' AND ');
    }

    if (orders.length) {
      sql += '\nORDER BY ' + stringifyOuterOrder(orders, dialect.quote);
    }

    return sql;
  });

  function stringifySqlAST(_x, _x2, _x3) {
    return _ref.apply(this, arguments);
  }

  return stringifySqlAST;
})();

function stringifyOuterOrder(orders, q) {
  const conditions = [];
  for (let condition of orders) {
    for (let column in condition.columns) {
      const direction = condition.columns[column];
      conditions.push(`${q(condition.table)}.${q(column)} ${direction}`);
    }
  }
  return conditions.join(', ');
}