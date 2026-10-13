import { ESLintUtils, TSESTree, TSESLint, AST_NODE_TYPES as AST } from '@typescript-eslint/utils';
import * as ts from 'typescript';

/**
 * I7: money is `numeric(20,4)` in Postgres and `Decimal` in TypeScript.
 * A `number`-typed identifier whose name reads like money is a defect, not a
 * style issue: `0.1 + 0.2 !== 0.3` silently corrupts a ledger.
 */
export const MONEY_NAME_PATTERN = /amount|price|balance|total|sum|cost|revenue/i;

export type Options = [{ allow?: string[] }];
export type MessageIds = 'numberMoney';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/fincore/fincore/blob/main/tooling/eslint-plugin/README.md#${name}`,
);

/** `number`, `1.5`, `number | null`, `number | undefined` all count as number-like. */
function isNumberLike(type: ts.Type): boolean {
  if (type.isUnion()) {
    return type.types.some(isNumberLike);
  }
  return (type.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) !== 0;
}

export const noNumberMoney = createRule<Options, MessageIds>({
  name: 'no-number-money',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `number`-typed identifiers that name a monetary value; use Decimal/Money (invariant I7).',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allow: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      numberMoney:
        "'{{name}}' is typed `number` but names a monetary value. Money is Decimal/Money in TypeScript and numeric(20,4) in Postgres (invariant I7). If this is not money, rename it or add it to the rule's `allow` list.",
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const allow = new Set(options.allow ?? []);
    const services = ESLintUtils.getParserServices(context);

    /** Report `node` (an identifier-ish declaration name) when it is money-shaped. */
    function check(name: string, nameNode: TSESTree.Node, typeNode: TSESTree.Node): void {
      if (allow.has(name) || !MONEY_NAME_PATTERN.test(name)) {
        return;
      }
      const type = services.getTypeAtLocation(typeNode);
      if (!isNumberLike(type)) {
        return;
      }
      context.report({ node: nameNode, messageId: 'numberMoney', data: { name } });
    }

    /** Names reachable from a binding position: plain identifiers and defaulted params. */
    function checkBinding(node: TSESTree.Node): void {
      if (node.type === AST.AssignmentPattern) {
        checkBinding(node.left);
        return;
      }
      if (node.type === AST.RestElement) {
        return;
      }
      if (node.type === AST.Identifier) {
        check(node.name, node, node);
      }
    }

    function propertyName(key: TSESTree.Node): string | null {
      if (key.type === AST.Identifier) {
        return key.name;
      }
      if (key.type === AST.Literal && typeof key.value === 'string') {
        return key.value;
      }
      return null;
    }

    /** A named member (class field, interface member, object literal property). */
    function checkMember(key: TSESTree.Node, typeNode: TSESTree.Node | undefined): void {
      const name = propertyName(key);
      if (name === null || typeNode === undefined) {
        return;
      }
      check(name, key, typeNode);
    }

    /** `function totalCost(): number` — the name is on the function, the type on its return. */
    function checkReturn(
      id: TSESTree.Identifier | null,
      returnType: TSESTree.TSTypeAnnotation | undefined,
    ): void {
      if (id === null || returnType === undefined) {
        return;
      }
      check(id.name, id, returnType.typeAnnotation);
    }

    return {
      VariableDeclarator(node): void {
        checkBinding(node.id);
      },

      FunctionDeclaration(node): void {
        node.params.forEach(checkBinding);
        checkReturn(node.id, node.returnType);
      },
      TSDeclareFunction(node): void {
        node.params.forEach(checkBinding);
        checkReturn(node.id, node.returnType);
      },
      FunctionExpression(node): void {
        node.params.forEach(checkBinding);
      },
      ArrowFunctionExpression(node): void {
        node.params.forEach(checkBinding);
      },
      TSFunctionType(node): void {
        node.params.forEach(checkBinding);
      },
      TSMethodSignature(node): void {
        node.params.forEach(checkBinding);
        checkMember(node.key, node.returnType?.typeAnnotation);
      },
      MethodDefinition(node): void {
        checkReturn(node.key.type === AST.Identifier ? node.key : null, node.value.returnType);
      },

      PropertyDefinition(node): void {
        checkMember(node.key, node.typeAnnotation?.typeAnnotation ?? node.value ?? node.key);
      },
      TSPropertySignature(node): void {
        checkMember(node.key, node.typeAnnotation?.typeAnnotation ?? node.key);
      },
      Property(node): void {
        if (node.computed) {
          return;
        }
        checkMember(node.key, node.value);
      },
    } satisfies TSESLint.RuleListener;
  },
});
