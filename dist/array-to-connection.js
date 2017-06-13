'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _graphqlRelay = require('graphql-relay');

var _util = require('./util');

function arrToConnection(data, sqlAST) {
  for (let astChild of sqlAST.children || []) {
    if (Array.isArray(data)) {
      for (let dataItem of data) {
        recurseOnObjInData(dataItem, astChild);
      }
    } else if (data) {
      recurseOnObjInData(data, astChild);
    }
  }
  const pageInfo = {
    hasNextPage: false,
    hasPreviousPage: false
  };
  if (!data) {
    if (sqlAST.paginate) {
      return {
        pageInfo,
        edges: []
      };
    } else {
      return null;
    }
  }

  if (sqlAST.paginate && !data._paginated) {
    if (sqlAST.sortKey) {
      if (sqlAST.args && sqlAST.args.first) {
        if (data.length > sqlAST.args.first) {
          pageInfo.hasNextPage = true;
          data.pop();
        }
      } else if (sqlAST.args && sqlAST.args.last) {
        if (data.length > sqlAST.args.last) {
          pageInfo.hasPreviousPage = true;
          data.pop();
        }
        data.reverse();
      }

      const edges = data.map(obj => {
        const cursor = {};
        const key = sqlAST.sortKey.key;
        for (let column of (0, _util.wrap)(key)) {
          cursor[column] = obj[column];
        }
        return { cursor: (0, _util.objToCursor)(cursor), node: obj };
      });
      if (data.length) {
        pageInfo.startCursor = edges[0].cursor;
        pageInfo.endCursor = (0, _util.last)(edges).cursor;
      }
      return { edges, pageInfo, _paginated: true };
    } else if (sqlAST.orderBy) {
      let offset = 0;
      if (sqlAST.args && sqlAST.args.after) {
        offset = (0, _graphqlRelay.cursorToOffset)(sqlAST.args.after) + 1;
      }

      const arrayLength = data[0] && parseInt(data[0].$total);
      const connection = (0, _graphqlRelay.connectionFromArraySlice)(data, sqlAST.args || {}, { sliceStart: offset, arrayLength });
      connection.total = arrayLength || 0;
      connection._paginated = true;
      return connection;
    }
  }
  return data;
}

exports.default = arrToConnection;


function recurseOnObjInData(dataObj, astChild) {
  const dataChild = dataObj[astChild.fieldName];
  if (dataChild) {
    dataObj[astChild.fieldName] = arrToConnection(dataObj[astChild.fieldName], astChild);
  }
}