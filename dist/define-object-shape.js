'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = defineObjectShape;

var _util = require('./util');

function defineObjectShape(topNode) {
  (0, _util.validateSqlAST)(topNode);
  return _defineObjectShape(null, '', topNode);
}

function _defineObjectShape(parent, prefix, node) {
  const prefixToPass = parent ? prefix + node.as + '__' : prefix;

  const fieldDefinition = {};

  for (let child of node.children) {
    switch (child.type) {
      case 'column':
        fieldDefinition[child.fieldName] = prefixToPass + child.as;
        break;
      case 'composite':
        fieldDefinition[child.fieldName] = prefixToPass + child.as;
        break;
      case 'columnDeps':
        for (let name in child.names) {
          fieldDefinition[name] = prefixToPass + child.names[name];
        }
        break;
      case 'expression':
        fieldDefinition[child.fieldName] = prefixToPass + child.as;
        break;
      case 'union':
      case 'table':
        if (child.sqlBatch) {
          fieldDefinition[child.sqlBatch.parentKey.fieldName] = prefixToPass + child.sqlBatch.parentKey.as;
        } else {
          const definition = _defineObjectShape(node, prefixToPass, child);
          fieldDefinition[child.fieldName] = definition;
        }
    }
  }

  for (let typeName in node.typedChildren || {}) {
    const suffix = '@' + typeName;
    for (let child of node.typedChildren[typeName]) {
      switch (child.type) {
        case 'column':
          fieldDefinition[child.fieldName + suffix] = prefixToPass + child.as;
          break;
        case 'composite':
          fieldDefinition[child.fieldName + suffix] = prefixToPass + child.as;
          break;
        case 'columnDeps':
          for (let name in child.names) {
            fieldDefinition[name + suffix] = prefixToPass + child.names[name];
          }
          break;
        case 'expression':
          fieldDefinition[child.fieldName + suffix] = prefixToPass + child.as;
          break;
        case 'union':
        case 'table':
          if (child.sqlBatch) {
            fieldDefinition[child.sqlBatch.parentKey.fieldName + suffix] = prefixToPass + child.sqlBatch.parentKey.as;
          } else {
            const definition = _defineObjectShape(node, prefixToPass, child);
            fieldDefinition[child.fieldName + suffix] = definition;
          }
      }
    }
  }

  if (node.grabMany) {
    return [fieldDefinition];
  } else {
    return fieldDefinition;
  }
}