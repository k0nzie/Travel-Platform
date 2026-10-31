// Dependency-free baseline lint using the existing TypeScript parser. This is intentionally
// small: syntax, conflict markers, trailing whitespace, debugger, var and loose equality.
// Type correctness is checked separately by tsc --noEmit.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
let failures = 0;
let count = 0;
function check(file) {
  const source = fs.readFileSync(file, 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const report = (position, message) => {
    const { line, character } = tree.getLineAndCharacterOfPosition(position);
    console.error(`${file}:${line + 1}:${character + 1} ${message}`);
    failures++;
  };
  for (const diagnostic of tree.parseDiagnostics) report(diagnostic.start, ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  for (const match of source.matchAll(/^(?:<<<<<<< |=======|>>>>>>> ).*$/gm)) report(match.index, 'Unresolved merge marker');
  for (const match of source.matchAll(/[\t ]+\r?$/gm)) report(match.index, 'Trailing whitespace');
  function visit(node) {
    if (ts.isDebuggerStatement(node)) report(node.getStart(), 'Remove debugger statement');
    if (ts.isVariableDeclarationList(node) && !(node.flags & ts.NodeFlags.BlockScoped)) report(node.getStart(), 'Use let or const instead of var');
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(node.operatorToken.kind) && node.left.kind !== ts.SyntaxKind.NullKeyword && node.right.kind !== ts.SyntaxKind.NullKeyword) report(node.getStart(), 'Use strict equality (null checks excepted)');
    ts.forEachChild(node, visit);
  }
  visit(tree);
  count++;
}
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith('.ts')) check(file);
  }
}
walk('src');
console.log(`Linted ${count} TypeScript files; ${failures} issues.`);
process.exitCode = failures ? 1 : 0;
