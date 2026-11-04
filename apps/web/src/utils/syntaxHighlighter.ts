/**
 * Ultra-fast, zero-dependency Syntax Highlighter for Chat Code Blocks.
 * Provides rich syntax color highlighting for Python, JavaScript, TypeScript,
 * HTML/XML, CSS, JSON, Bash/Shell, SQL, C++, Java, Rust, Go, and generic code.
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* -------------------------------------------------------------------------- */
/* Language Definitions & Sets                                               */
/* -------------------------------------------------------------------------- */

const PYTHON_KEYWORDS = new Set([
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from',
  'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not',
  'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
  'match', 'case'
]);

const PYTHON_BUILTINS = new Set([
  'self', 'cls', 'None', 'True', 'False', 'Ellipsis', '__init__', '__name__',
  '__doc__', '__main__', '__str__', '__repr__', 'print', 'len', 'range',
  'int', 'float', 'str', 'list', 'dict', 'set', 'tuple', 'bool', 'type',
  'super', 'isinstance', 'issubclass', 'enumerate', 'zip', 'map', 'filter',
  'all', 'any', 'min', 'max', 'sum', 'sorted', 'reversed', 'open', 'id',
  'input', 'dir', 'vars', 'hasattr', 'getattr', 'setattr', 'delattr'
]);

const JS_KEYWORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'finally',
  'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'return',
  'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void',
  'while', 'with', 'yield', 'let', 'static', 'enum', 'await', 'async',
  'implements', 'interface', 'package', 'private', 'protected', 'public',
  'type', 'declare', 'abstract', 'as', 'from', 'of', 'namespace'
]);

const JS_BUILTINS = new Set([
  'null', 'undefined', 'true', 'false', 'NaN', 'Infinity', 'console',
  'window', 'document', 'Promise', 'Array', 'Object', 'String', 'Number',
  'Boolean', 'Date', 'Math', 'JSON', 'Map', 'Set', 'RegExp', 'Error',
  'React', 'useState', 'useEffect', 'useMemo', 'useCallback', 'useRef',
  'useContext', 'useId', 'fetch', 'setTimeout', 'clearTimeout', 'setInterval'
]);

const BASH_COMMANDS = new Set([
  'git', 'npm', 'pnpm', 'yarn', 'bun', 'npx', 'cd', 'ls', 'mkdir', 'rm',
  'cp', 'mv', 'cat', 'curl', 'wget', 'chmod', 'chown', 'docker', 'sudo',
  'export', 'echo', 'grep', 'find', 'sed', 'awk', 'node', 'python', 'pip',
  'source', 'touch', 'tar', 'unzip', 'ps', 'kill', 'systemctl', 'ssh',
  'clear', 'history', 'exit'
]);

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
  'DELETE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS',
  'ON', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'AND', 'OR',
  'NOT', 'IN', 'AS', 'IS', 'NULL', 'CREATE', 'TABLE', 'DROP', 'ALTER',
  'INDEX', 'VIEW', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'DEFAULT',
  'UNION', 'ALL', 'DISTINCT', 'BETWEEN', 'LIKE', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'ASC', 'DESC', 'CASCADE', 'CONSTRAINT', 'EXISTS', 'WITH',
  'DATABASE', 'SCHEMA', 'EXPLAIN', 'ANALYZE', 'BEGIN', 'COMMIT', 'ROLLBACK'
]);

const SQL_FUNCTIONS = new Set([
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NOW', 'DATE', 'CONCAT',
  'LOWER', 'UPPER', 'TRIM', 'ROUND', 'SUBSTRING', 'LENGTH', 'IFNULL', 'NULLIF'
]);

const CLANG_KEYWORDS = new Set([
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
  'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static',
  'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while',
  'class', 'public', 'private', 'protected', 'virtual', 'override', 'template',
  'typename', 'namespace', 'using', 'constexpr', 'nullptr', 'bool', 'true', 'false',
  'fn', 'let', 'mut', 'pub', 'impl', 'trait', 'match', 'use', 'mod', 'crate',
  'func', 'package', 'defer', 'go', 'chan', 'range', 'interface'
]);

/* -------------------------------------------------------------------------- */
/* Tokenizer Implementations                                                  */
/* -------------------------------------------------------------------------- */

function highlightPython(code: string): string {
  const tokenRegex = /("""[\s\S]*?"""|'''[\s\S]*?''')|(#.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b(?:0[xX][0-9a-fA-F]+|\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\b)|(@[a-zA-Z_]\w*)|(\bdef\s+)([a-zA-Z_]\w*)|(\bclass\s+)([a-zA-Z_]\w*)|(\b[a-zA-Z_]\w*\b)(?=\s*\()|(\b[a-zA-Z_]\w*\b)|([+\-*/%&|^~<>!=]=?|\/\/=?|\*\*=?|->)/gm;

  let lastIndex = 0;
  let out = '';
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      out += escapeHtml(code.slice(lastIndex, match.index));
    }
    lastIndex = match.index + match[0].length;

    const [full, tripleStr, comment, str, num, decorator, defKw, defName, classKw, className, fnCall, word, op] = match;

    if (tripleStr) {
      out += `<span class="hl-docstring">${escapeHtml(tripleStr)}</span>`;
    } else if (comment) {
      out += `<span class="hl-comment">${escapeHtml(comment)}</span>`;
    } else if (str) {
      out += `<span class="hl-string">${escapeHtml(str)}</span>`;
    } else if (num) {
      out += `<span class="hl-number">${escapeHtml(num)}</span>`;
    } else if (decorator) {
      out += `<span class="hl-builtin">${escapeHtml(decorator)}</span>`;
    } else if (defKw && defName) {
      out += `<span class="hl-keyword">${escapeHtml(defKw)}</span><span class="hl-function">${escapeHtml(defName)}</span>`;
    } else if (classKw && className) {
      out += `<span class="hl-keyword">${escapeHtml(classKw)}</span><span class="hl-class">${escapeHtml(className)}</span>`;
    } else if (fnCall) {
      if (PYTHON_KEYWORDS.has(fnCall)) {
        out += `<span class="hl-keyword">${escapeHtml(fnCall)}</span>`;
      } else if (PYTHON_BUILTINS.has(fnCall)) {
        out += `<span class="hl-builtin">${escapeHtml(fnCall)}</span>`;
      } else {
        out += `<span class="hl-function">${escapeHtml(fnCall)}</span>`;
      }
    } else if (word) {
      if (PYTHON_KEYWORDS.has(word)) {
        out += `<span class="hl-keyword">${escapeHtml(word)}</span>`;
      } else if (PYTHON_BUILTINS.has(word)) {
        out += `<span class="hl-builtin">${escapeHtml(word)}</span>`;
      } else if (/^[A-Z][a-zA-Z0-9_]*$/.test(word)) {
        out += `<span class="hl-class">${escapeHtml(word)}</span>`;
      } else {
        out += escapeHtml(word);
      }
    } else if (op) {
      out += `<span class="hl-operator">${escapeHtml(op)}</span>`;
    } else {
      out += escapeHtml(full);
    }
  }

  if (lastIndex < code.length) {
    out += escapeHtml(code.slice(lastIndex));
  }

  return out;
}

function highlightJsTs(code: string): string {
  const tokenRegex = /(\/\*[\s\S]*?\*\/|\/\/.*$)|(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b(?:0[xX][0-9a-fA-F]+|\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\b)|(\b(?:function|class|interface|type|enum)\s+)([a-zA-Z_$][\w$]*)|(\b[a-zA-Z_$][\w$]*\b)(?=\s*\()|(\b[a-zA-Z_$][\w$]*\b)|(=>|===|!==|==|!=|<=|>=|[+\-*/%&|^~<>!=]=?|\?\.|\?\?)/gm;

  let lastIndex = 0;
  let out = '';
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      out += escapeHtml(code.slice(lastIndex, match.index));
    }
    lastIndex = match.index + match[0].length;

    const [full, comment, str, num, declKw, declName, fnCall, word, op] = match;

    if (comment) {
      out += `<span class="hl-comment">${escapeHtml(comment)}</span>`;
    } else if (str) {
      out += `<span class="hl-string">${escapeHtml(str)}</span>`;
    } else if (num) {
      out += `<span class="hl-number">${escapeHtml(num)}</span>`;
    } else if (declKw && declName) {
      out += `<span class="hl-keyword">${escapeHtml(declKw)}</span><span class="hl-class">${escapeHtml(declName)}</span>`;
    } else if (fnCall) {
      if (JS_KEYWORDS.has(fnCall)) {
        out += `<span class="hl-keyword">${escapeHtml(fnCall)}</span>`;
      } else if (JS_BUILTINS.has(fnCall)) {
        out += `<span class="hl-builtin">${escapeHtml(fnCall)}</span>`;
      } else {
        out += `<span class="hl-function">${escapeHtml(fnCall)}</span>`;
      }
    } else if (word) {
      if (JS_KEYWORDS.has(word)) {
        out += `<span class="hl-keyword">${escapeHtml(word)}</span>`;
      } else if (JS_BUILTINS.has(word)) {
        out += `<span class="hl-builtin">${escapeHtml(word)}</span>`;
      } else if (/^[A-Z][a-zA-Z0-9_$]*$/.test(word)) {
        out += `<span class="hl-class">${escapeHtml(word)}</span>`;
      } else {
        out += escapeHtml(word);
      }
    } else if (op) {
      out += `<span class="hl-operator">${escapeHtml(op)}</span>`;
    } else {
      out += escapeHtml(full);
    }
  }

  if (lastIndex < code.length) {
    out += escapeHtml(code.slice(lastIndex));
  }

  return out;
}

function highlightJson(code: string): string {
  const tokenRegex = /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false|null)\b/g;

  let lastIndex = 0;
  let out = '';
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      out += escapeHtml(code.slice(lastIndex, match.index));
    }
    lastIndex = match.index + match[0].length;

    const [full, key, str, num, boolNull] = match;

    if (key) {
      out += `<span class="hl-property">${escapeHtml(key)}</span>`;
    } else if (str) {
      out += `<span class="hl-string">${escapeHtml(str)}</span>`;
    } else if (num) {
      out += `<span class="hl-number">${escapeHtml(num)}</span>`;
    } else if (boolNull) {
      out += `<span class="hl-builtin">${escapeHtml(boolNull)}</span>`;
    } else {
      out += escapeHtml(full);
    }
  }

  if (lastIndex < code.length) {
    out += escapeHtml(code.slice(lastIndex));
  }

  return out;
}

function highlightHtml(code: string): string {
  // Matches HTML comments, tags, attributes, and strings
  const tokenRegex = /(<!--[\s\S]*?-->)|(<\/?)([a-zA-Z0-9:-]+)|(\/?>)|([a-zA-Z0-9:-]+)(?=\s*=)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;

  let lastIndex = 0;
  let out = '';
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      out += escapeHtml(code.slice(lastIndex, match.index));
    }
    lastIndex = match.index + match[0].length;

    const [full, comment, openTag, tagName, closeTag, attrName, attrVal] = match;

    if (comment) {
      out += `<span class="hl-comment">${escapeHtml(comment)}</span>`;
    } else if (openTag && tagName) {
      out += `${escapeHtml(openTag)}<span class="hl-tag">${escapeHtml(tagName)}</span>`;
    } else if (closeTag) {
      out += escapeHtml(closeTag);
    } else if (attrName) {
      out += `<span class="hl-attr">${escapeHtml(attrName)}</span>`;
    } else if (attrVal) {
      out += `<span class="hl-string">${escapeHtml(attrVal)}</span>`;
    } else {
      out += escapeHtml(full);
    }
  }

  if (lastIndex < code.length) {
    out += escapeHtml(code.slice(lastIndex));
  }

  return out;
}

function highlightCss(code: string): string {
  const tokenRegex = /(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(#(?:[0-9a-fA-F]{3,8}))|(\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|deg|fr)\b)|([a-zA-Z0-9_-]+)(?=\s*:)|([a-zA-Z0-9_#.:-]+)(?=\s*\{)/g;

  let lastIndex = 0;
  let out = '';
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      out += escapeHtml(code.slice(lastIndex, match.index));
    }
    lastIndex = match.index + match[0].length;

    const [full, comment, str, hexColor, dimension, property, selector] = match;

    if (comment) {
      out += `<span class="hl-comment">${escapeHtml(comment)}</span>`;
    } else if (str) {
      out += `<span class="hl-string">${escapeHtml(str)}</span>`;
    } else if (hexColor) {
      out += `<span class="hl-builtin">${escapeHtml(hexColor)}</span>`;
    } else if (dimension) {
      out += `<span class="hl-number">${escapeHtml(dimension)}</span>`;
    } else if (property) {
      out += `<span class="hl-property">${escapeHtml(property)}</span>`;
    } else if (selector) {
      out += `<span class="hl-tag">${escapeHtml(selector)}</span>`;
    } else {
      out += escapeHtml(full);
    }
  }

  if (lastIndex < code.length) {
    out += escapeHtml(code.slice(lastIndex));
  }

  return out;
}

function highlightBash(code: string): string {
  const tokenRegex = /(#.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\$\{[^}]+\}|\$[a-zA-Z_]\w*)|(--?[a-zA-Z0-9_-]+)|(\b[a-zA-Z_]\w*\b)/gm;

  let lastIndex = 0;
  let out = '';
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      out += escapeHtml(code.slice(lastIndex, match.index));
    }
    lastIndex = match.index + match[0].length;

    const [full, comment, str, variable, flag, word] = match;

    if (comment) {
      out += `<span class="hl-comment">${escapeHtml(comment)}</span>`;
    } else if (str) {
      out += `<span class="hl-string">${escapeHtml(str)}</span>`;
    } else if (variable) {
      out += `<span class="hl-variable">${escapeHtml(variable)}</span>`;
    } else if (flag) {
      out += `<span class="hl-attr">${escapeHtml(flag)}</span>`;
    } else if (word) {
      if (BASH_COMMANDS.has(word.toLowerCase())) {
        out += `<span class="hl-keyword">${escapeHtml(word)}</span>`;
      } else {
        out += escapeHtml(word);
      }
    } else {
      out += escapeHtml(full);
    }
  }

  if (lastIndex < code.length) {
    out += escapeHtml(code.slice(lastIndex));
  }

  return out;
}

function highlightSql(code: string): string {
  const tokenRegex = /(--.*$|\/\*[\s\S]*?\*\/)|('(?:''|[^'])*')|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_]\w*\b)/gm;

  let lastIndex = 0;
  let out = '';
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      out += escapeHtml(code.slice(lastIndex, match.index));
    }
    lastIndex = match.index + match[0].length;

    const [full, comment, str, num, word] = match;

    if (comment) {
      out += `<span class="hl-comment">${escapeHtml(comment)}</span>`;
    } else if (str) {
      out += `<span class="hl-string">${escapeHtml(str)}</span>`;
    } else if (num) {
      out += `<span class="hl-number">${escapeHtml(num)}</span>`;
    } else if (word) {
      const upper = word.toUpperCase();
      if (SQL_KEYWORDS.has(upper)) {
        out += `<span class="hl-keyword">${escapeHtml(word)}</span>`;
      } else if (SQL_FUNCTIONS.has(upper)) {
        out += `<span class="hl-function">${escapeHtml(word)}</span>`;
      } else {
        out += escapeHtml(word);
      }
    } else {
      out += escapeHtml(full);
    }
  }

  if (lastIndex < code.length) {
    out += escapeHtml(code.slice(lastIndex));
  }

  return out;
}

function highlightClang(code: string): string {
  const tokenRegex = /(\/\*[\s\S]*?\*\/|\/\/.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b(?:0[xX][0-9a-fA-F]+|\d+\.?\d*|\.\d+)\b)|(\b[a-zA-Z_]\w*\b)(?=\s*\()|(\b[a-zA-Z_]\w*\b)|(#include\s+<[^>]+>|#[a-zA-Z_]\w*)/gm;

  let lastIndex = 0;
  let out = '';
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      out += escapeHtml(code.slice(lastIndex, match.index));
    }
    lastIndex = match.index + match[0].length;

    const [full, comment, str, num, fnCall, word, preprocessor] = match;

    if (comment) {
      out += `<span class="hl-comment">${escapeHtml(comment)}</span>`;
    } else if (str) {
      out += `<span class="hl-string">${escapeHtml(str)}</span>`;
    } else if (num) {
      out += `<span class="hl-number">${escapeHtml(num)}</span>`;
    } else if (preprocessor) {
      out += `<span class="hl-builtin">${escapeHtml(preprocessor)}</span>`;
    } else if (fnCall) {
      if (CLANG_KEYWORDS.has(fnCall)) {
        out += `<span class="hl-keyword">${escapeHtml(fnCall)}</span>`;
      } else {
        out += `<span class="hl-function">${escapeHtml(fnCall)}</span>`;
      }
    } else if (word) {
      if (CLANG_KEYWORDS.has(word)) {
        out += `<span class="hl-keyword">${escapeHtml(word)}</span>`;
      } else if (/^[A-Z][a-zA-Z0-9_]*$/.test(word)) {
        out += `<span class="hl-class">${escapeHtml(word)}</span>`;
      } else {
        out += escapeHtml(word);
      }
    } else {
      out += escapeHtml(full);
    }
  }

  if (lastIndex < code.length) {
    out += escapeHtml(code.slice(lastIndex));
  }

  return out;
}

function highlightGeneric(code: string): string {
  // Generic fallback: strings, comments, numbers, keywords
  const tokenRegex = /(\/\*[\s\S]*?\*\/|\/\/.*$|#.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d+(?:\.\d+)?\b)|(\b(?:function|def|class|return|if|else|for|while|import|const|let|var)\b)/gm;

  let lastIndex = 0;
  let out = '';
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      out += escapeHtml(code.slice(lastIndex, match.index));
    }
    lastIndex = match.index + match[0].length;

    const [full, comment, str, num, kw] = match;

    if (comment) {
      out += `<span class="hl-comment">${escapeHtml(comment)}</span>`;
    } else if (str) {
      out += `<span class="hl-string">${escapeHtml(str)}</span>`;
    } else if (num) {
      out += `<span class="hl-number">${escapeHtml(num)}</span>`;
    } else if (kw) {
      out += `<span class="hl-keyword">${escapeHtml(kw)}</span>`;
    } else {
      out += escapeHtml(full);
    }
  }

  if (lastIndex < code.length) {
    out += escapeHtml(code.slice(lastIndex));
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export function highlightCode(
  code: string,
  rawLang?: string
): { html: string; language: string } {
  const normalized = (rawLang || '').trim().toLowerCase();

  // Python
  if (normalized === 'python' || normalized === 'py') {
    return { html: highlightPython(code), language: 'python' };
  }

  // JavaScript / TypeScript / React JSX / TSX
  if (
    normalized === 'javascript' ||
    normalized === 'js' ||
    normalized === 'jsx' ||
    normalized === 'typescript' ||
    normalized === 'ts' ||
    normalized === 'tsx'
  ) {
    return { html: highlightJsTs(code), language: normalized || 'javascript' };
  }

  // JSON
  if (normalized === 'json') {
    return { html: highlightJson(code), language: 'json' };
  }

  // HTML / XML / SVG
  if (
    normalized === 'html' ||
    normalized === 'xml' ||
    normalized === 'svg' ||
    normalized === 'markup'
  ) {
    return { html: highlightHtml(code), language: normalized || 'html' };
  }

  // CSS / SCSS
  if (normalized === 'css' || normalized === 'scss' || normalized === 'sass') {
    return { html: highlightCss(code), language: normalized || 'css' };
  }

  // Bash / Shell
  if (
    normalized === 'bash' ||
    normalized === 'sh' ||
    normalized === 'shell' ||
    normalized === 'zsh'
  ) {
    return { html: highlightBash(code), language: 'bash' };
  }

  // SQL
  if (normalized === 'sql') {
    return { html: highlightSql(code), language: 'sql' };
  }

  // C / C++ / C# / Java / Rust / Go
  if (
    normalized === 'c' ||
    normalized === 'cpp' ||
    normalized === 'c++' ||
    normalized === 'csharp' ||
    normalized === 'cs' ||
    normalized === 'java' ||
    normalized === 'rust' ||
    normalized === 'rs' ||
    normalized === 'go' ||
    normalized === 'golang'
  ) {
    return { html: highlightClang(code), language: normalized };
  }

  // If language isn't explicitly specified, inspect code heuristically
  if (!normalized || normalized === 'code' || normalized === 'text') {
    if (
      /\bdef\s+[a-zA-Z_]\w*|\bclass\s+[a-zA-Z_]\w*:|\bimport\s+[a-zA-Z_]|\bself\./.test(
        code
      )
    ) {
      return { html: highlightPython(code), language: 'python' };
    }
    if (
      /\bconst\s+|\blet\s+|\bfunction\s+|\bconsole\.log\(|=>/.test(code)
    ) {
      return { html: highlightJsTs(code), language: 'javascript' };
    }
    if (/^\s*[{\[]/.test(code) && /[}\]]\s*$/.test(code)) {
      return { html: highlightJson(code), language: 'json' };
    }
    if (/^\s*<(!DOCTYPE|[a-zA-Z0-9]+)/i.test(code)) {
      return { html: highlightHtml(code), language: 'html' };
    }
  }

  // Generic fallback
  return {
    html: highlightGeneric(code),
    language: normalized || 'code',
  };
}
