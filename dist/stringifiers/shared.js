'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.joinPrefix = joinPrefix;
exports.quotePrefix = quotePrefix;
exports.thisIsNotTheEndOfThisBatch = thisIsNotTheEndOfThisBatch;
exports.thisIsTheEndOfThisBatch = thisIsTheEndOfThisBatch;
exports.whereConditionIsntSupposedToGoInsideSubqueryOrOnNextBatch = whereConditionIsntSupposedToGoInsideSubqueryOrOnNextBatch;
exports.keysetPagingSelect = keysetPagingSelect;
exports.offsetPagingSelect = offsetPagingSelect;
exports.orderColumnsToString = orderColumnsToString;
exports.handleOrderBy = handleOrderBy;
exports.interpretForOffsetPaging = interpretForOffsetPaging;
exports.interpretForKeysetPaging = interpretForKeysetPaging;
exports.validateCursor = validateCursor;

var _util = require('util');

var _util2 = _interopRequireDefault(_util);

var _lodash = require('lodash');

var _graphqlRelay = require('graphql-relay');

var _util3 = require('../util');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function joinPrefix(prefix) {
  return prefix.slice(1).map(name => name + '__').join('');
}

function doubleQuote(str) {
  return `"${str}"`;
}

function quotePrefix(prefix, q = doubleQuote) {
  return prefix.map(name => q(name));
}

function thisIsNotTheEndOfThisBatch(node, parent) {
  return !node.sqlBatch && !node.junctionBatch || !parent;
}

function thisIsTheEndOfThisBatch(node, parent) {
  return (node.sqlBatch || node.junctionBatch) && parent;
}

function whereConditionIsntSupposedToGoInsideSubqueryOrOnNextBatch(node, parent) {
  return !node.paginate && (!node.sqlBatch || !parent);
}

function keysetPagingSelect(table, whereCondition, orderColumns, limit, as, options = {}) {
  let { joinCondition, joinType, q } = options;
  q = q || doubleQuote;
  whereCondition = (0, _lodash.filter)(whereCondition).join(' AND ') || 'TRUE';
  if (joinCondition) {
    return `\
${joinType || ''} JOIN LATERAL (
  SELECT *
  FROM ${table} ${q(as)}
  WHERE ${whereCondition}
  ORDER BY ${orderColumnsToString(orderColumns, q, as)}
  LIMIT ${limit}
) ${q(as)} ON ${joinCondition}`;
  } else {
    return `\
FROM (
  SELECT *
  FROM ${table} ${q(as)}
  WHERE ${whereCondition}
  ORDER BY ${orderColumnsToString(orderColumns, q, as)}
  LIMIT ${limit}
) ${q(as)}`;
  }
}

function offsetPagingSelect(table, pagingWhereConditions, orderColumns, limit, offset, as, options = {}) {
  let { joinCondition, joinType, q } = options;
  q = q || doubleQuote;
  const whereCondition = (0, _lodash.filter)(pagingWhereConditions).join(' AND ') || 'TRUE';
  if (joinCondition) {
    return `\
${joinType || ''} JOIN LATERAL (
  SELECT *, count(*) OVER () AS ${q('$total')}
  FROM ${table} ${q(as)}
  WHERE ${whereCondition}
  ORDER BY ${orderColumnsToString(orderColumns, q, as)}
  LIMIT ${limit} OFFSET ${offset}
) ${q(as)} ON ${joinCondition}`;
  } else {
    return `\
FROM (
  SELECT *, count(*) OVER () AS ${q('$total')}
  FROM ${table} ${q(as)}
  WHERE ${whereCondition}
  ORDER BY ${orderColumnsToString(orderColumns, q, as)}
  LIMIT ${limit} OFFSET ${offset}
) ${q(as)}`;
  }
}

function orderColumnsToString(orderColumns, q, as) {
  const conditions = [];
  for (let column in orderColumns) {
    conditions.push(`${as ? q(as) + '.' : ''}${q(column)} ${orderColumns[column]}`);
  }
  return conditions.join(', ');
}

function handleOrderBy(orderBy) {
  const orderColumns = {};
  if (typeof orderBy === 'object') {
    for (let column in orderBy) {
      let direction = orderBy[column].toUpperCase();
      if (direction !== 'ASC' && direction !== 'DESC') {
        throw new Error(direction + ' is not a valid sorting direction');
      }
      orderColumns[column] = direction;
    }
  } else if (typeof orderBy === 'string') {
    orderColumns[orderBy] = 'ASC';
  } else {
    throw new Error('"orderBy" is invalid type: ' + _util2.default.inspect(orderBy));
  }
  return orderColumns;
}

function interpretForOffsetPaging(node, dialect) {
  const { name } = dialect;
  if (node.args && node.args.last) {
    throw new Error('Backward pagination not supported with offsets. Consider using keyset pagination instead');
  }
  let limit = ['mariadb', 'mysql', 'oracle'].includes(name) ? '18446744073709551615' : 'ALL';
  const orderColumns = handleOrderBy(node.orderBy);
  let offset = 0;
  if (node.args && node.args.first) {
    limit = parseInt(node.args.first) + 1;
    if (node.args.after) {
      offset = (0, _graphqlRelay.cursorToOffset)(node.args.after) + 1;
    }
  }
  return { limit, offset, orderColumns };
}

function interpretForKeysetPaging(node, dialect) {
  const { name } = dialect;
  const orderColumns = {};
  let descending = node.sortKey.order.toUpperCase() === 'DESC';

  if (node.args && node.args.last) {
    descending = !descending;
  }
  for (let column of (0, _util3.wrap)(node.sortKey.key)) {
    orderColumns[column] = descending ? 'DESC' : 'ASC';
  }

  let limit = ['mariadb', 'mysql', 'oracle'].includes(name) ? '18446744073709551615' : 'ALL';
  let whereCondition = '';
  if (node.args && node.args.first) {
    limit = parseInt(node.args.first) + 1;
    if (node.args.after) {
      const cursorObj = (0, _util3.cursorToObj)(node.args.after);
      validateCursor(cursorObj, (0, _util3.wrap)(node.sortKey.key));
      whereCondition = sortKeyToWhereCondition(cursorObj, descending, dialect);
    }
    if (node.args.before) {
      throw new Error('Using "before" with "first" is nonsensical.');
    }
  } else if (node.args && node.args.last) {
    limit = parseInt(node.args.last) + 1;
    if (node.args.before) {
      const cursorObj = (0, _util3.cursorToObj)(node.args.before);
      validateCursor(cursorObj, (0, _util3.wrap)(node.sortKey.key));
      whereCondition = sortKeyToWhereCondition(cursorObj, descending, dialect);
    }
    if (node.args.after) {
      throw new Error('Using "after" with "last" is nonsensical.');
    }
  }

  return { limit, orderColumns, whereCondition };
}

function validateCursor(cursorObj, expectedKeys) {
  const actualKeys = Object.keys(cursorObj);
  const expectedKeySet = new Set(expectedKeys);
  const actualKeySet = new Set(actualKeys);
  for (let key of actualKeys) {
    if (!expectedKeySet.has(key)) {
      throw new Error(`Invalid cursor. The column "${key}" is not in the sort key.`);
    }
  }
  for (let key of expectedKeys) {
    if (!actualKeySet.has(key)) {
      throw new Error(`Invalid cursor. The column "${key}" is not in the cursor.`);
    }
  }
}

function sortKeyToWhereCondition(keyObj, descending, dialect) {
  const { name, quote: q } = dialect;
  const sortColumns = [];
  const sortValues = [];
  for (let key in keyObj) {
    sortColumns.push(`${q(key)}`);
    sortValues.push((0, _util3.maybeQuote)(keyObj[key], name));
  }
  const operator = descending ? '<' : '>';
  return name === 'oracle' ? recursiveWhereJoin(sortColumns, sortValues, operator) : `(${sortColumns.join(', ')}) ${operator} (${sortValues.join(', ')})`;
}

function recursiveWhereJoin(columns, values, op) {
  const condition = `${columns.pop()} ${op} ${values.pop()}`;
  return _recursiveWhereJoin(columns, values, op, condition);
}

function _recursiveWhereJoin(columns, values, op, condition) {
  if (!columns.length) {
    return condition;
  }
  const column = columns.pop();
  const value = values.pop();
  condition = `(${column} ${op} ${value} OR (${column} = ${value} AND ${condition}))`;
  return _recursiveWhereJoin(columns, values, op, condition);
}