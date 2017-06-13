'use strict';

var _shared = require('../shared');

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const dialect = module.exports = {
  name: 'pg',

  quote(str) {
    return `"${str}"`;
  },

  compositeKey(parent, keys) {
    keys = keys.map(key => `"${parent}"."${key}"`);
    return `NULLIF(CONCAT(${keys.join(', ')}), '')`;
  },

  handleJoinedOneToManyPaginated: (() => {
    var _ref = _asyncToGenerator(function* (parent, node, prefix, context, selections, tables, wheres, orders, joinCondition) {
      const pagingWhereConditions = [yield node.sqlJoin(`"${parent.as}"`, `"${node.as}"`, node.args || {}, context)];
      if (node.where) {
        pagingWhereConditions.push((yield node.where(`"${node.as}"`, node.args || {}, context, (0, _shared.quotePrefix)(prefix))));
      }

      if (node.sortKey) {
        var { limit, orderColumns, whereCondition: whereAddendum } = (0, _shared.interpretForKeysetPaging)(node, dialect);
        pagingWhereConditions.push(whereAddendum);
        tables.push((0, _shared.keysetPagingSelect)(node.name, pagingWhereConditions, orderColumns, limit, node.as, { joinCondition, joinType: 'LEFT' }));
      } else if (node.orderBy) {
        var { limit, offset, orderColumns } = (0, _shared.interpretForOffsetPaging)(node, dialect);
        tables.push((0, _shared.offsetPagingSelect)(node.name, pagingWhereConditions, orderColumns, limit, offset, node.as, { joinCondition, joinType: 'LEFT' }));
      }
      orders.push({
        table: node.as,
        columns: orderColumns
      });
    });

    return function handleJoinedOneToManyPaginated(_x, _x2, _x3, _x4, _x5, _x6, _x7, _x8, _x9) {
      return _ref.apply(this, arguments);
    };
  })(),

  handleBatchedManyToManyPaginated: (() => {
    var _ref2 = _asyncToGenerator(function* (parent, node, prefix, context, selections, tables, wheres, orders, batchScope, joinCondition) {
      const pagingWhereConditions = [`"${node.junctionTableAs}"."${node.junctionBatch.thisKey.name}" = temp."${node.junctionBatch.parentKey.name}"`];
      if (node.where) {
        pagingWhereConditions.push((yield node.where(`"${node.as}"`, node.args || {}, context, (0, _shared.quotePrefix)(prefix))));
      }

      const tempTable = `FROM (VALUES ${batchScope.map(function (val) {
        return `(${val})`;
      })}) temp("${node.junctionBatch.parentKey.name}")`;
      tables.push(tempTable);
      const lateralJoinCondition = `"${node.junctionTableAs}"."${node.junctionBatch.thisKey.name}" = temp."${node.junctionBatch.parentKey.name}"`;

      if (node.sortKey) {
        var { limit, orderColumns, whereCondition: whereAddendum } = (0, _shared.interpretForKeysetPaging)(node, dialect);
        pagingWhereConditions.push(whereAddendum);
        tables.push((0, _shared.keysetPagingSelect)(node.junctionTable, pagingWhereConditions, orderColumns, limit, node.junctionTableAs, { joinCondition: lateralJoinCondition, joinType: 'LEFT' }));
      } else if (node.orderBy) {
        var { limit, offset, orderColumns } = (0, _shared.interpretForOffsetPaging)(node, dialect);
        tables.push((0, _shared.offsetPagingSelect)(node.junctionTable, pagingWhereConditions, orderColumns, limit, offset, node.junctionTableAs, { joinCondition: lateralJoinCondition, joinType: 'LEFT' }));
      }
      tables.push(`LEFT JOIN ${node.name} AS "${node.as}" ON ${joinCondition}`);

      orders.push({
        table: node.junctionTableAs,
        columns: orderColumns
      });
    });

    return function handleBatchedManyToManyPaginated(_x10, _x11, _x12, _x13, _x14, _x15, _x16, _x17, _x18, _x19) {
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
        tables.push((0, _shared.keysetPagingSelect)(node.junctionTable, pagingWhereConditions, orderColumns, limit, node.junctionTableAs, { joinCondition: joinCondition1, joinType: 'LEFT' }));
      } else if (node.orderBy) {
        var { limit, offset, orderColumns } = (0, _shared.interpretForOffsetPaging)(node, dialect);
        tables.push((0, _shared.offsetPagingSelect)(node.junctionTable, pagingWhereConditions, orderColumns, limit, offset, node.junctionTableAs, { joinCondition: joinCondition1, joinType: 'LEFT' }));
      }
      orders.push({
        table: node.junctionTableAs,
        columns: orderColumns
      });
    });

    return function handleJoinedManyToManyPaginated(_x20, _x21, _x22, _x23, _x24, _x25, _x26, _x27, _x28) {
      return _ref3.apply(this, arguments);
    };
  })(),

  handlePaginationAtRoot: (() => {
    var _ref4 = _asyncToGenerator(function* (parent, node, prefix, context, selections, tables, wheres, orders) {
      const pagingWhereConditions = [];
      if (node.sortKey) {
        var { limit, orderColumns, whereCondition: whereAddendum } = (0, _shared.interpretForKeysetPaging)(node, dialect);
        pagingWhereConditions.push(whereAddendum);
        if (node.where) {
          pagingWhereConditions.push((yield node.where(`"${node.as}"`, node.args || {}, context, (0, _shared.quotePrefix)(prefix))));
        }
        tables.push((0, _shared.keysetPagingSelect)(node.name, pagingWhereConditions, orderColumns, limit, node.as));
      } else if (node.orderBy) {
        var { limit, offset, orderColumns } = (0, _shared.interpretForOffsetPaging)(node, dialect);
        if (node.where) {
          pagingWhereConditions.push((yield node.where(`"${node.as}"`, node.args || {}, context, (0, _shared.quotePrefix)(prefix))));
        }
        tables.push((0, _shared.offsetPagingSelect)(node.name, pagingWhereConditions, orderColumns, limit, offset, node.as));
      }
      orders.push({
        table: node.as,
        columns: orderColumns
      });
    });

    return function handlePaginationAtRoot(_x29, _x30, _x31, _x32, _x33, _x34, _x35, _x36) {
      return _ref4.apply(this, arguments);
    };
  })(),

  handleBatchedOneToManyPaginated: (() => {
    var _ref5 = _asyncToGenerator(function* (parent, node, prefix, context, selections, tables, wheres, orders, batchScope) {
      const pagingWhereConditions = [`"${node.as}"."${node.sqlBatch.thisKey.name}" = temp."${node.sqlBatch.parentKey.name}"`];
      if (node.where) {
        pagingWhereConditions.push((yield node.where(`"${node.as}"`, node.args || {}, context, [])));
      }
      const tempTable = `FROM (VALUES ${batchScope.map(function (val) {
        return `(${val})`;
      })}) temp("${node.sqlBatch.parentKey.name}")`;
      tables.push(tempTable);
      const lateralJoinCondition = `"${node.as}"."${node.sqlBatch.thisKey.name}" = temp."${node.sqlBatch.parentKey.name}"`;
      if (node.sortKey) {
        var { limit, orderColumns, whereCondition: whereAddendum } = (0, _shared.interpretForKeysetPaging)(node, dialect);
        pagingWhereConditions.push(whereAddendum);
        tables.push((0, _shared.keysetPagingSelect)(node.name, pagingWhereConditions, orderColumns, limit, node.as, { joinCondition: lateralJoinCondition }));
      } else if (node.orderBy) {
        var { limit, offset, orderColumns } = (0, _shared.interpretForOffsetPaging)(node, dialect);
        tables.push((0, _shared.offsetPagingSelect)(node.name, pagingWhereConditions, orderColumns, limit, offset, node.as, { joinCondition: lateralJoinCondition }));
      }
      orders.push({
        table: node.as,
        columns: orderColumns
      });
    });

    return function handleBatchedOneToManyPaginated(_x37, _x38, _x39, _x40, _x41, _x42, _x43, _x44, _x45) {
      return _ref5.apply(this, arguments);
    };
  })()

};