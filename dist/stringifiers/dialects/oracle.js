'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _shared = require('../shared');

var _lodash = require('lodash');

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

function recursiveConcat(keys) {
  if (keys.length <= 1) {
    return keys[0];
  }
  return recursiveConcat([`CONCAT(${keys[0]}, ${keys[1]})`, ...keys.slice(2)]);
}

const q = str => `"${str}"`;

function keysetPagingSelect(table, whereCondition, orderColumns, limit, as, options = {}) {
  let { joinCondition, joinType } = options;
  const q = str => `"${str}"`;
  whereCondition = (0, _lodash.filter)(whereCondition).join(' AND ');
  if (joinCondition) {
    return `\
${joinType === 'LEFT' ? 'OUTER' : 'CROSS'} APPLY (
  SELECT *
  FROM ${table} "${as}"
  ${whereCondition ? `WHERE ${whereCondition}` : ''}
  ORDER BY ${(0, _shared.orderColumnsToString)(orderColumns, q, as)}
  FETCH FIRST ${limit} ROWS ONLY
) ${q(as)}`;
  } else {
    return `\
FROM (
  SELECT *
  FROM ${table} "${as}"
  ${whereCondition ? `WHERE ${whereCondition}` : ''}
  ORDER BY ${(0, _shared.orderColumnsToString)(orderColumns, q, as)}
  FETCH FIRST ${limit} ROWS ONLY
) ${q(as)}`;
  }
}

function offsetPagingSelect(table, pagingWhereConditions, orderColumns, limit, offset, as, options = {}) {
  let { joinCondition, joinType } = options;
  const whereCondition = (0, _lodash.filter)(pagingWhereConditions).join(' AND ') || '1 = 1';
  if (joinCondition) {
    return `\
${joinType === 'LEFT' ? 'OUTER' : 'CROSS'} APPLY (
  SELECT "${as}".*, count(*) OVER () AS ${q('$total')}
  FROM ${table} "${as}"
  WHERE ${whereCondition}
  ORDER BY ${(0, _shared.orderColumnsToString)(orderColumns, q, as)}
  OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
) ${q(as)}`;
  } else {
    return `\
FROM (
  SELECT "${as}".*, count(*) OVER () AS ${q('$total')}
  FROM ${table} "${as}"
  WHERE ${whereCondition}
  ORDER BY ${(0, _shared.orderColumnsToString)(orderColumns, q, as)}
  OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
) ${q(as)}`;
  }
}

const dialect = module.exports = _extends({}, require('./pg'), {
  name: 'oracle',

  compositeKey(parent, keys) {
    keys = keys.map(key => `"${parent}"."${key}"`);
    return `NULLIF(${recursiveConcat(keys)}, '')`;
  },

  handlePaginationAtRoot: (() => {
    var _ref = _asyncToGenerator(function* (parent, node, prefix, context, selections, tables, wheres, orders) {
      const pagingWhereConditions = [];
      if (node.sortKey) {
        var { limit, orderColumns, whereCondition: whereAddendum } = (0, _shared.interpretForKeysetPaging)(node, dialect);
        pagingWhereConditions.push(whereAddendum);
        if (node.where) {
          pagingWhereConditions.push((yield node.where(`"${node.as}"`, node.args || {}, context, (0, _shared.quotePrefix)(prefix))));
        }
        tables.push(keysetPagingSelect(node.name, pagingWhereConditions, orderColumns, limit, node.as));
      } else if (node.orderBy) {
        var { limit, offset, orderColumns } = (0, _shared.interpretForOffsetPaging)(node, dialect);
        if (node.where) {
          pagingWhereConditions.push((yield node.where(`"${node.as}"`, node.args || {}, context, (0, _shared.quotePrefix)(prefix))));
        }
        tables.push(offsetPagingSelect(node.name, pagingWhereConditions, orderColumns, limit, offset, node.as));
      }
      orders.push({
        table: node.as,
        columns: orderColumns
      });
    });

    return function handlePaginationAtRoot(_x, _x2, _x3, _x4, _x5, _x6, _x7, _x8) {
      return _ref.apply(this, arguments);
    };
  })(),

  handleJoinedOneToManyPaginated: (() => {
    var _ref2 = _asyncToGenerator(function* (parent, node, prefix, context, selections, tables, wheres, orders, joinCondition) {
      const pagingWhereConditions = [yield node.sqlJoin(`"${parent.as}"`, q(node.as), node.args || {}, context)];
      if (node.where) {
        pagingWhereConditions.push((yield node.where(`"${node.as}"`, node.args || {}, context, (0, _shared.quotePrefix)(prefix))));
      }

      if (node.sortKey) {
        var { limit, orderColumns, whereCondition: whereAddendum } = (0, _shared.interpretForKeysetPaging)(node, dialect);
        pagingWhereConditions.push(whereAddendum);
        tables.push(keysetPagingSelect(node.name, pagingWhereConditions, orderColumns, limit, node.as, { joinCondition, joinType: 'LEFT' }));
      } else if (node.orderBy) {
        var { limit, offset, orderColumns } = (0, _shared.interpretForOffsetPaging)(node, dialect);
        tables.push(offsetPagingSelect(node.name, pagingWhereConditions, orderColumns, limit, offset, node.as, { joinCondition, joinType: 'LEFT' }));
      }
      orders.push({
        table: node.as,
        columns: orderColumns
      });
    });

    return function handleJoinedOneToManyPaginated(_x9, _x10, _x11, _x12, _x13, _x14, _x15, _x16, _x17) {
      return _ref2.apply(this, arguments);
    };
  })(),

  handleJoinedManyToManyPaginated: (() => {
    var _ref3 = _asyncToGenerator(function* (parent, node, prefix, context, selections, tables, wheres, orders, joinCondition1) {
      const pagingWhereConditions = [yield node.sqlJoins[0](`"${parent.as}"`, `"${node.junctionTableAs}"`, node.args || {}, context)];
      if (node.where) {
        pagingWhereConditions.push((yield node.where(`"${node.as}"`, node.args || {}, context, (0, _shared.quotePrefix)(prefix))));
      }

      if (node.sortKey) {
        var { limit, orderColumns, whereCondition: whereAddendum } = (0, _shared.interpretForKeysetPaging)(node, dialect);
        pagingWhereConditions.push(whereAddendum);
        tables.push(keysetPagingSelect(node.junctionTable, pagingWhereConditions, orderColumns, limit, node.junctionTableAs, { joinCondition: joinCondition1, joinType: 'LEFT' }));
      } else if (node.orderBy) {
        var { limit, offset, orderColumns } = (0, _shared.interpretForOffsetPaging)(node, dialect);
        tables.push(offsetPagingSelect(node.junctionTable, pagingWhereConditions, orderColumns, limit, offset, node.junctionTableAs, { joinCondition: joinCondition1, joinType: 'LEFT' }));
      }
      orders.push({
        table: node.junctionTableAs,
        columns: orderColumns
      });
    });

    return function handleJoinedManyToManyPaginated(_x18, _x19, _x20, _x21, _x22, _x23, _x24, _x25, _x26) {
      return _ref3.apply(this, arguments);
    };
  })(),

  handleBatchedOneToManyPaginated: (() => {
    var _ref4 = _asyncToGenerator(function* (parent, node, prefix, context, selections, tables, wheres, orders, batchScope) {
      const pagingWhereConditions = [`"${node.as}"."${node.sqlBatch.thisKey.name}" = "temp"."value"`];
      if (node.where) {
        pagingWhereConditions.push((yield node.where(`"${node.as}"`, node.args || {}, context, [])));
      }
      tables.push(`FROM (${arrToTableUnion(batchScope)}) "temp"`);
      const lateralJoinCondition = `"${node.as}"."${node.sqlBatch.thisKey.name}" = "temp"."value"`;
      if (node.sortKey) {
        var { limit, orderColumns, whereCondition: whereAddendum } = (0, _shared.interpretForKeysetPaging)(node, dialect);
        pagingWhereConditions.push(whereAddendum);
        tables.push(keysetPagingSelect(node.name, pagingWhereConditions, orderColumns, limit, node.as, { joinCondition: lateralJoinCondition }));
      } else if (node.orderBy) {
        var { limit, offset, orderColumns } = (0, _shared.interpretForOffsetPaging)(node, dialect);
        tables.push(offsetPagingSelect(node.name, pagingWhereConditions, orderColumns, limit, offset, node.as, { joinCondition: lateralJoinCondition }));
      }
      orders.push({
        table: node.as,
        columns: orderColumns
      });
    });

    return function handleBatchedOneToManyPaginated(_x27, _x28, _x29, _x30, _x31, _x32, _x33, _x34, _x35) {
      return _ref4.apply(this, arguments);
    };
  })(),

  handleBatchedManyToManyPaginated: (() => {
    var _ref5 = _asyncToGenerator(function* (parent, node, prefix, context, selections, tables, wheres, orders, batchScope, joinCondition) {
      const pagingWhereConditions = [`"${node.junctionTableAs}"."${node.junctionBatch.thisKey.name}" = "temp"."value"`];
      if (node.where) {
        pagingWhereConditions.push((yield node.where(`"${node.as}"`, node.args || {}, context, (0, _shared.quotePrefix)(prefix))));
      }

      tables.push(`FROM (${arrToTableUnion(batchScope)}) "temp"`);
      const lateralJoinCondition = `"${node.junctionTableAs}"."${node.junctionBatch.thisKey.name}" = "temp"."value"`;

      if (node.sortKey) {
        var { limit, orderColumns, whereCondition: whereAddendum } = (0, _shared.interpretForKeysetPaging)(node, dialect);
        pagingWhereConditions.push(whereAddendum);
        tables.push(keysetPagingSelect(node.junctionTable, pagingWhereConditions, orderColumns, limit, node.junctionTableAs, { joinCondition: lateralJoinCondition, joinType: 'LEFT' }));
      } else if (node.orderBy) {
        var { limit, offset, orderColumns } = (0, _shared.interpretForOffsetPaging)(node, dialect);
        tables.push(offsetPagingSelect(node.junctionTable, pagingWhereConditions, orderColumns, limit, offset, node.junctionTableAs, { joinCondition: lateralJoinCondition, joinType: 'LEFT' }));
      }
      tables.push(`LEFT JOIN ${node.name} "${node.as}" ON ${joinCondition}`);

      orders.push({
        table: node.junctionTableAs,
        columns: orderColumns
      });
    });

    return function handleBatchedManyToManyPaginated(_x36, _x37, _x38, _x39, _x40, _x41, _x42, _x43, _x44, _x45) {
      return _ref5.apply(this, arguments);
    };
  })()
});

function arrToTableUnion(arr) {
  return arr.map(val => `
  SELECT ${val} AS "value" FROM DUAL
`).join(' UNION ');
}