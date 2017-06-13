'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _shared = require('../shared');

var _lodash = require('lodash');

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

function quote(str) {
  return `\`${str}\``;
}

function joinUnions(unions, as) {
  return `FROM (
${unions.join('\nUNION\n')}
) AS ${quote(as)}`;
}

function paginatedSelect(table, as, whereConditions, orderColumns, limit, offset, withTotal = false) {
  return `\
  (SELECT *${withTotal ? ', count(*) OVER () AS `$total`' : ''}
  FROM ${table} ${quote(as)}
  WHERE ${whereConditions}
  ORDER BY ${(0, _shared.orderColumnsToString)(orderColumns, quote)}
  LIMIT ${limit}${offset ? ' OFFSET ' + offset : ''})`;
}

const dialect = module.exports = _extends({}, require('./mixins/pagination-not-supported'), {

  name: 'mariadb',

  quote,

  compositeKey(parent, keys) {
    keys = keys.map(key => `${quote(parent)}.${quote(key)}`);
    return `CONCAT(${keys.join(', ')})`;
  },

  handlePaginationAtRoot: (() => {
    var _ref = _asyncToGenerator(function* (parent, node, prefix, context, selections, joins, wheres, orders) {
      const pagingWhereConditions = [];
      if (node.sortKey) {
        var { limit, orderColumns, whereCondition: whereAddendum } = (0, _shared.interpretForKeysetPaging)(node, dialect);
        pagingWhereConditions.push(whereAddendum);
        if (node.where) {
          pagingWhereConditions.push((yield node.where(`${quote(node.as)}`, node.args || {}, context, (0, _shared.quotePrefix)(prefix, quote))));
        }
        joins.push((0, _shared.keysetPagingSelect)(node.name, pagingWhereConditions, orderColumns, limit, node.as, { q: quote }));
      } else if (node.orderBy) {
        var { limit, offset, orderColumns } = (0, _shared.interpretForOffsetPaging)(node, dialect);
        if (node.where) {
          pagingWhereConditions.push((yield node.where(`${quote(node.as)}`, node.args || {}, context, (0, _shared.quotePrefix)(prefix, quote))));
        }
        joins.push((0, _shared.offsetPagingSelect)(node.name, pagingWhereConditions, orderColumns, limit, offset, node.as, { q: quote }));
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

  handleBatchedOneToManyPaginated: (() => {
    var _ref2 = _asyncToGenerator(function* (parent, node, prefix, context, selections, joins, wheres, orders, batchScope) {
      const pagingWhereConditions = [];
      if (node.where) {
        pagingWhereConditions.push((yield node.where(`${quote(node.as)}`, node.args || {}, context, (0, _shared.quotePrefix)(prefix, quote))));
      }
      if (node.sortKey) {
        var { limit, orderColumns, whereCondition: whereAddendum } = (0, _shared.interpretForKeysetPaging)(node, dialect);
        pagingWhereConditions.push(whereAddendum);
        const unions = batchScope.map(function (val) {
          let whereConditions = [...pagingWhereConditions, `${quote(node.as)}.${quote(node.sqlBatch.thisKey.name)} = ${val}`];
          whereConditions = (0, _lodash.filter)(whereConditions).join(' AND ') || '1';
          return paginatedSelect(node.name, node.as, whereConditions, orderColumns, limit, offset, true);
        });
        joins.push(joinUnions(unions, node.as));
      } else if (node.orderBy) {
        var { limit, offset, orderColumns } = (0, _shared.interpretForOffsetPaging)(node, dialect);
        const unions = batchScope.map(function (val) {
          let whereConditions = [...pagingWhereConditions, `${quote(node.as)}.${quote(node.sqlBatch.thisKey.name)} = ${val}`];
          whereConditions = (0, _lodash.filter)(whereConditions).join(' AND ') || '1';
          return paginatedSelect(node.name, node.as, whereConditions, orderColumns, limit, offset, true);
        });
        joins.push(joinUnions(unions, node.as));
      }
      orders.push({
        table: node.as,
        columns: orderColumns
      });
    });

    return function handleBatchedOneToManyPaginated(_x9, _x10, _x11, _x12, _x13, _x14, _x15, _x16, _x17) {
      return _ref2.apply(this, arguments);
    };
  })(),

  handleBatchedManyToManyPaginated: (() => {
    var _ref3 = _asyncToGenerator(function* (parent, node, prefix, context, selections, joins, wheres, orders, batchScope, joinCondition) {
      const pagingWhereConditions = [];
      if (node.where) {
        pagingWhereConditions.push((yield node.where(`${quote(node.as)}`, node.args || {}, context, (0, _shared.quotePrefix)(prefix, quote))));
      }
      if (node.sortKey) {
        var { limit, orderColumns, whereCondition: whereAddendum } = (0, _shared.interpretForKeysetPaging)(node, dialect);
        pagingWhereConditions.push(whereAddendum);
        const unions = batchScope.map(function (val) {
          let whereConditions = [...pagingWhereConditions, `${quote(node.junctionTableAs)}.${quote(node.junctionBatch.thisKey.name)} = ${val}`];
          whereConditions = (0, _lodash.filter)(whereConditions).join(' AND ') || '1';
          return paginatedSelect(node.junctionTable, node.junctionTableAs, whereConditions, orderColumns, limit, offset, true);
        });
        joins.push(joinUnions(unions, node.junctionTableAs));
      } else if (node.orderBy) {
        var { limit, offset, orderColumns } = (0, _shared.interpretForOffsetPaging)(node, dialect);
        const unions = batchScope.map(function (val) {
          let whereConditions = [...pagingWhereConditions, `${quote(node.junctionTableAs)}.${quote(node.junctionBatch.thisKey.name)} = ${val}`];
          whereConditions = (0, _lodash.filter)(whereConditions).join(' AND ') || '1';
          return paginatedSelect(node.junctionTable, node.junctionTableAs, whereConditions, orderColumns, limit, offset, true);
        });
        joins.push(joinUnions(unions, node.junctionTableAs));
      }
      joins.push(`LEFT JOIN ${node.name} AS ${quote(node.as)} ON ${joinCondition}`);
      orders.push({
        table: node.junctionTableAs,
        columns: orderColumns
      });
    });

    return function handleBatchedManyToManyPaginated(_x18, _x19, _x20, _x21, _x22, _x23, _x24, _x25, _x26, _x27) {
      return _ref3.apply(this, arguments);
    };
  })()
});