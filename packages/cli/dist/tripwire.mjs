#!/usr/bin/env node
import { createRequire as __cr } from "node:module";
const require = __cr(import.meta.url);

// src/main.ts
import { readFileSync as readFileSync7, writeFileSync as writeFileSync4 } from "node:fs";
import { isAbsolute as isAbsolute4, join as join9, relative as relative2, resolve as resolve6, sep as sep2 } from "node:path";

// ../core/src/discovery/reader.ts
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
var SCRIPT_READ_CAP = 256 * 1024;
function makeRepoReader(root) {
  let rootReal;
  try {
    rootReal = realpathSync(root);
  } catch {
    return () => void 0;
  }
  return (rel) => {
    try {
      if (!rel || rel.includes("\0")) return void 0;
      const abs = resolve(root, rel);
      const st = lstatSync(abs);
      if (!st.isFile() || st.isSymbolicLink() || st.size > SCRIPT_READ_CAP) return void 0;
      const real = realpathSync(abs);
      if (real !== rootReal && !real.startsWith(rootReal + sep)) return void 0;
      return readFileSync(real, "utf8");
    } catch {
      return void 0;
    }
  };
}

// ../core/src/discovery/discover.ts
import { lstatSync as lstatSync2, readdirSync, readFileSync as readFileSync2 } from "node:fs";
import { join } from "node:path";

// ../../node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/scanner.js
function createScanner(text2, ignoreTrivia = false) {
  const len = text2.length;
  let pos = 0, value = "", tokenOffset = 0, token = 16, lineNumber = 0, lineStartOffset = 0, tokenLineStartOffset = 0, prevTokenLineStartOffset = 0, scanError = 0;
  function scanHexDigits(count, exact) {
    let digits = 0;
    let value2 = 0;
    while (digits < count || !exact) {
      let ch = text2.charCodeAt(pos);
      if (ch >= 48 && ch <= 57) {
        value2 = value2 * 16 + ch - 48;
      } else if (ch >= 65 && ch <= 70) {
        value2 = value2 * 16 + ch - 65 + 10;
      } else if (ch >= 97 && ch <= 102) {
        value2 = value2 * 16 + ch - 97 + 10;
      } else {
        break;
      }
      pos++;
      digits++;
    }
    if (digits < count) {
      value2 = -1;
    }
    return value2;
  }
  function setPosition(newPosition) {
    pos = newPosition;
    value = "";
    tokenOffset = 0;
    token = 16;
    scanError = 0;
  }
  function scanNumber() {
    let start = pos;
    if (text2.charCodeAt(pos) === 48) {
      pos++;
    } else {
      pos++;
      while (pos < text2.length && isDigit(text2.charCodeAt(pos))) {
        pos++;
      }
    }
    if (pos < text2.length && text2.charCodeAt(pos) === 46) {
      pos++;
      if (pos < text2.length && isDigit(text2.charCodeAt(pos))) {
        pos++;
        while (pos < text2.length && isDigit(text2.charCodeAt(pos))) {
          pos++;
        }
      } else {
        scanError = 3;
        return text2.substring(start, pos);
      }
    }
    let end = pos;
    if (pos < text2.length && (text2.charCodeAt(pos) === 69 || text2.charCodeAt(pos) === 101)) {
      pos++;
      if (pos < text2.length && text2.charCodeAt(pos) === 43 || text2.charCodeAt(pos) === 45) {
        pos++;
      }
      if (pos < text2.length && isDigit(text2.charCodeAt(pos))) {
        pos++;
        while (pos < text2.length && isDigit(text2.charCodeAt(pos))) {
          pos++;
        }
        end = pos;
      } else {
        scanError = 3;
      }
    }
    return text2.substring(start, end);
  }
  function scanString() {
    let result = "", start = pos;
    while (true) {
      if (pos >= len) {
        result += text2.substring(start, pos);
        scanError = 2;
        break;
      }
      const ch = text2.charCodeAt(pos);
      if (ch === 34) {
        result += text2.substring(start, pos);
        pos++;
        break;
      }
      if (ch === 92) {
        result += text2.substring(start, pos);
        pos++;
        if (pos >= len) {
          scanError = 2;
          break;
        }
        const ch2 = text2.charCodeAt(pos++);
        switch (ch2) {
          case 34:
            result += '"';
            break;
          case 92:
            result += "\\";
            break;
          case 47:
            result += "/";
            break;
          case 98:
            result += "\b";
            break;
          case 102:
            result += "\f";
            break;
          case 110:
            result += "\n";
            break;
          case 114:
            result += "\r";
            break;
          case 116:
            result += "	";
            break;
          case 117:
            const ch3 = scanHexDigits(4, true);
            if (ch3 >= 0) {
              result += String.fromCharCode(ch3);
            } else {
              scanError = 4;
            }
            break;
          default:
            scanError = 5;
        }
        start = pos;
        continue;
      }
      if (ch >= 0 && ch <= 31) {
        if (isLineBreak(ch)) {
          result += text2.substring(start, pos);
          scanError = 2;
          break;
        } else {
          scanError = 6;
        }
      }
      pos++;
    }
    return result;
  }
  function scanNext() {
    value = "";
    scanError = 0;
    tokenOffset = pos;
    lineStartOffset = lineNumber;
    prevTokenLineStartOffset = tokenLineStartOffset;
    if (pos >= len) {
      tokenOffset = len;
      return token = 17;
    }
    let code = text2.charCodeAt(pos);
    if (isWhiteSpace(code)) {
      do {
        pos++;
        value += String.fromCharCode(code);
        code = text2.charCodeAt(pos);
      } while (isWhiteSpace(code));
      return token = 15;
    }
    if (isLineBreak(code)) {
      pos++;
      value += String.fromCharCode(code);
      if (code === 13 && text2.charCodeAt(pos) === 10) {
        pos++;
        value += "\n";
      }
      lineNumber++;
      tokenLineStartOffset = pos;
      return token = 14;
    }
    switch (code) {
      // tokens: []{}:,
      case 123:
        pos++;
        return token = 1;
      case 125:
        pos++;
        return token = 2;
      case 91:
        pos++;
        return token = 3;
      case 93:
        pos++;
        return token = 4;
      case 58:
        pos++;
        return token = 6;
      case 44:
        pos++;
        return token = 5;
      // strings
      case 34:
        pos++;
        value = scanString();
        return token = 10;
      // comments
      case 47:
        const start = pos - 1;
        if (text2.charCodeAt(pos + 1) === 47) {
          pos += 2;
          while (pos < len) {
            if (isLineBreak(text2.charCodeAt(pos))) {
              break;
            }
            pos++;
          }
          value = text2.substring(start, pos);
          return token = 12;
        }
        if (text2.charCodeAt(pos + 1) === 42) {
          pos += 2;
          const safeLength = len - 1;
          let commentClosed = false;
          while (pos < safeLength) {
            const ch = text2.charCodeAt(pos);
            if (ch === 42 && text2.charCodeAt(pos + 1) === 47) {
              pos += 2;
              commentClosed = true;
              break;
            }
            pos++;
            if (isLineBreak(ch)) {
              if (ch === 13 && text2.charCodeAt(pos) === 10) {
                pos++;
              }
              lineNumber++;
              tokenLineStartOffset = pos;
            }
          }
          if (!commentClosed) {
            pos++;
            scanError = 1;
          }
          value = text2.substring(start, pos);
          return token = 13;
        }
        value += String.fromCharCode(code);
        pos++;
        return token = 16;
      // numbers
      case 45:
        value += String.fromCharCode(code);
        pos++;
        if (pos === len || !isDigit(text2.charCodeAt(pos))) {
          return token = 16;
        }
      // found a minus, followed by a number so
      // we fall through to proceed with scanning
      // numbers
      case 48:
      case 49:
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57:
        value += scanNumber();
        return token = 11;
      // literals and unknown symbols
      default:
        while (pos < len && isUnknownContentCharacter(code)) {
          pos++;
          code = text2.charCodeAt(pos);
        }
        if (tokenOffset !== pos) {
          value = text2.substring(tokenOffset, pos);
          switch (value) {
            case "true":
              return token = 8;
            case "false":
              return token = 9;
            case "null":
              return token = 7;
          }
          return token = 16;
        }
        value += String.fromCharCode(code);
        pos++;
        return token = 16;
    }
  }
  function isUnknownContentCharacter(code) {
    if (isWhiteSpace(code) || isLineBreak(code)) {
      return false;
    }
    switch (code) {
      case 125:
      case 93:
      case 123:
      case 91:
      case 34:
      case 58:
      case 44:
      case 47:
        return false;
    }
    return true;
  }
  function scanNextNonTrivia() {
    let result;
    do {
      result = scanNext();
    } while (result >= 12 && result <= 15);
    return result;
  }
  return {
    setPosition,
    getPosition: () => pos,
    scan: ignoreTrivia ? scanNextNonTrivia : scanNext,
    getToken: () => token,
    getTokenValue: () => value,
    getTokenOffset: () => tokenOffset,
    getTokenLength: () => pos - tokenOffset,
    getTokenStartLine: () => lineStartOffset,
    getTokenStartCharacter: () => tokenOffset - prevTokenLineStartOffset,
    getTokenError: () => scanError
  };
}
function isWhiteSpace(ch) {
  return ch === 32 || ch === 9;
}
function isLineBreak(ch) {
  return ch === 10 || ch === 13;
}
function isDigit(ch) {
  return ch >= 48 && ch <= 57;
}
var CharacterCodes;
(function(CharacterCodes2) {
  CharacterCodes2[CharacterCodes2["lineFeed"] = 10] = "lineFeed";
  CharacterCodes2[CharacterCodes2["carriageReturn"] = 13] = "carriageReturn";
  CharacterCodes2[CharacterCodes2["space"] = 32] = "space";
  CharacterCodes2[CharacterCodes2["_0"] = 48] = "_0";
  CharacterCodes2[CharacterCodes2["_1"] = 49] = "_1";
  CharacterCodes2[CharacterCodes2["_2"] = 50] = "_2";
  CharacterCodes2[CharacterCodes2["_3"] = 51] = "_3";
  CharacterCodes2[CharacterCodes2["_4"] = 52] = "_4";
  CharacterCodes2[CharacterCodes2["_5"] = 53] = "_5";
  CharacterCodes2[CharacterCodes2["_6"] = 54] = "_6";
  CharacterCodes2[CharacterCodes2["_7"] = 55] = "_7";
  CharacterCodes2[CharacterCodes2["_8"] = 56] = "_8";
  CharacterCodes2[CharacterCodes2["_9"] = 57] = "_9";
  CharacterCodes2[CharacterCodes2["a"] = 97] = "a";
  CharacterCodes2[CharacterCodes2["b"] = 98] = "b";
  CharacterCodes2[CharacterCodes2["c"] = 99] = "c";
  CharacterCodes2[CharacterCodes2["d"] = 100] = "d";
  CharacterCodes2[CharacterCodes2["e"] = 101] = "e";
  CharacterCodes2[CharacterCodes2["f"] = 102] = "f";
  CharacterCodes2[CharacterCodes2["g"] = 103] = "g";
  CharacterCodes2[CharacterCodes2["h"] = 104] = "h";
  CharacterCodes2[CharacterCodes2["i"] = 105] = "i";
  CharacterCodes2[CharacterCodes2["j"] = 106] = "j";
  CharacterCodes2[CharacterCodes2["k"] = 107] = "k";
  CharacterCodes2[CharacterCodes2["l"] = 108] = "l";
  CharacterCodes2[CharacterCodes2["m"] = 109] = "m";
  CharacterCodes2[CharacterCodes2["n"] = 110] = "n";
  CharacterCodes2[CharacterCodes2["o"] = 111] = "o";
  CharacterCodes2[CharacterCodes2["p"] = 112] = "p";
  CharacterCodes2[CharacterCodes2["q"] = 113] = "q";
  CharacterCodes2[CharacterCodes2["r"] = 114] = "r";
  CharacterCodes2[CharacterCodes2["s"] = 115] = "s";
  CharacterCodes2[CharacterCodes2["t"] = 116] = "t";
  CharacterCodes2[CharacterCodes2["u"] = 117] = "u";
  CharacterCodes2[CharacterCodes2["v"] = 118] = "v";
  CharacterCodes2[CharacterCodes2["w"] = 119] = "w";
  CharacterCodes2[CharacterCodes2["x"] = 120] = "x";
  CharacterCodes2[CharacterCodes2["y"] = 121] = "y";
  CharacterCodes2[CharacterCodes2["z"] = 122] = "z";
  CharacterCodes2[CharacterCodes2["A"] = 65] = "A";
  CharacterCodes2[CharacterCodes2["B"] = 66] = "B";
  CharacterCodes2[CharacterCodes2["C"] = 67] = "C";
  CharacterCodes2[CharacterCodes2["D"] = 68] = "D";
  CharacterCodes2[CharacterCodes2["E"] = 69] = "E";
  CharacterCodes2[CharacterCodes2["F"] = 70] = "F";
  CharacterCodes2[CharacterCodes2["G"] = 71] = "G";
  CharacterCodes2[CharacterCodes2["H"] = 72] = "H";
  CharacterCodes2[CharacterCodes2["I"] = 73] = "I";
  CharacterCodes2[CharacterCodes2["J"] = 74] = "J";
  CharacterCodes2[CharacterCodes2["K"] = 75] = "K";
  CharacterCodes2[CharacterCodes2["L"] = 76] = "L";
  CharacterCodes2[CharacterCodes2["M"] = 77] = "M";
  CharacterCodes2[CharacterCodes2["N"] = 78] = "N";
  CharacterCodes2[CharacterCodes2["O"] = 79] = "O";
  CharacterCodes2[CharacterCodes2["P"] = 80] = "P";
  CharacterCodes2[CharacterCodes2["Q"] = 81] = "Q";
  CharacterCodes2[CharacterCodes2["R"] = 82] = "R";
  CharacterCodes2[CharacterCodes2["S"] = 83] = "S";
  CharacterCodes2[CharacterCodes2["T"] = 84] = "T";
  CharacterCodes2[CharacterCodes2["U"] = 85] = "U";
  CharacterCodes2[CharacterCodes2["V"] = 86] = "V";
  CharacterCodes2[CharacterCodes2["W"] = 87] = "W";
  CharacterCodes2[CharacterCodes2["X"] = 88] = "X";
  CharacterCodes2[CharacterCodes2["Y"] = 89] = "Y";
  CharacterCodes2[CharacterCodes2["Z"] = 90] = "Z";
  CharacterCodes2[CharacterCodes2["asterisk"] = 42] = "asterisk";
  CharacterCodes2[CharacterCodes2["backslash"] = 92] = "backslash";
  CharacterCodes2[CharacterCodes2["closeBrace"] = 125] = "closeBrace";
  CharacterCodes2[CharacterCodes2["closeBracket"] = 93] = "closeBracket";
  CharacterCodes2[CharacterCodes2["colon"] = 58] = "colon";
  CharacterCodes2[CharacterCodes2["comma"] = 44] = "comma";
  CharacterCodes2[CharacterCodes2["dot"] = 46] = "dot";
  CharacterCodes2[CharacterCodes2["doubleQuote"] = 34] = "doubleQuote";
  CharacterCodes2[CharacterCodes2["minus"] = 45] = "minus";
  CharacterCodes2[CharacterCodes2["openBrace"] = 123] = "openBrace";
  CharacterCodes2[CharacterCodes2["openBracket"] = 91] = "openBracket";
  CharacterCodes2[CharacterCodes2["plus"] = 43] = "plus";
  CharacterCodes2[CharacterCodes2["slash"] = 47] = "slash";
  CharacterCodes2[CharacterCodes2["formFeed"] = 12] = "formFeed";
  CharacterCodes2[CharacterCodes2["tab"] = 9] = "tab";
})(CharacterCodes || (CharacterCodes = {}));

// ../../node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/string-intern.js
var cachedSpaces = new Array(20).fill(0).map((_, index) => {
  return " ".repeat(index);
});
var maxCachedValues = 200;
var cachedBreakLinesWithSpaces = {
  " ": {
    "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\n" + " ".repeat(index);
    }),
    "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r" + " ".repeat(index);
    }),
    "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r\n" + " ".repeat(index);
    })
  },
  "	": {
    "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\n" + "	".repeat(index);
    }),
    "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r" + "	".repeat(index);
    }),
    "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
      return "\r\n" + "	".repeat(index);
    })
  }
};

// ../../node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/parser.js
var ParseOptions;
(function(ParseOptions2) {
  ParseOptions2.DEFAULT = {
    allowTrailingComma: false
  };
})(ParseOptions || (ParseOptions = {}));
function parse(text2, errors = [], options = ParseOptions.DEFAULT) {
  let currentProperty = null;
  let currentParent = [];
  const previousParents = [];
  function onValue(value) {
    if (Array.isArray(currentParent)) {
      currentParent.push(value);
    } else if (currentProperty !== null) {
      currentParent[currentProperty] = value;
    }
  }
  const visitor = {
    onObjectBegin: () => {
      const object = {};
      onValue(object);
      previousParents.push(currentParent);
      currentParent = object;
      currentProperty = null;
    },
    onObjectProperty: (name) => {
      currentProperty = name;
    },
    onObjectEnd: () => {
      currentParent = previousParents.pop();
    },
    onArrayBegin: () => {
      const array = [];
      onValue(array);
      previousParents.push(currentParent);
      currentParent = array;
      currentProperty = null;
    },
    onArrayEnd: () => {
      currentParent = previousParents.pop();
    },
    onLiteralValue: onValue,
    onError: (error, offset, length) => {
      errors.push({ error, offset, length });
    }
  };
  visit(text2, visitor, options);
  return currentParent[0];
}
function parseTree(text2, errors = [], options = ParseOptions.DEFAULT) {
  let currentParent = { type: "array", offset: -1, length: -1, children: [], parent: void 0 };
  function ensurePropertyComplete(endOffset) {
    if (currentParent.type === "property") {
      currentParent.length = endOffset - currentParent.offset;
      currentParent = currentParent.parent;
    }
  }
  function onValue(valueNode) {
    currentParent.children.push(valueNode);
    return valueNode;
  }
  const visitor = {
    onObjectBegin: (offset) => {
      currentParent = onValue({ type: "object", offset, length: -1, parent: currentParent, children: [] });
    },
    onObjectProperty: (name, offset, length) => {
      currentParent = onValue({ type: "property", offset, length: -1, parent: currentParent, children: [] });
      currentParent.children.push({ type: "string", value: name, offset, length, parent: currentParent });
    },
    onObjectEnd: (offset, length) => {
      ensurePropertyComplete(offset + length);
      currentParent.length = offset + length - currentParent.offset;
      currentParent = currentParent.parent;
      ensurePropertyComplete(offset + length);
    },
    onArrayBegin: (offset, length) => {
      currentParent = onValue({ type: "array", offset, length: -1, parent: currentParent, children: [] });
    },
    onArrayEnd: (offset, length) => {
      currentParent.length = offset + length - currentParent.offset;
      currentParent = currentParent.parent;
      ensurePropertyComplete(offset + length);
    },
    onLiteralValue: (value, offset, length) => {
      onValue({ type: getNodeType(value), offset, length, parent: currentParent, value });
      ensurePropertyComplete(offset + length);
    },
    onSeparator: (sep3, offset, length) => {
      if (currentParent.type === "property") {
        if (sep3 === ":") {
          currentParent.colonOffset = offset;
        } else if (sep3 === ",") {
          ensurePropertyComplete(offset);
        }
      }
    },
    onError: (error, offset, length) => {
      errors.push({ error, offset, length });
    }
  };
  visit(text2, visitor, options);
  const result = currentParent.children[0];
  if (result) {
    delete result.parent;
  }
  return result;
}
function findNodeAtLocation(root, path) {
  if (!root) {
    return void 0;
  }
  let node = root;
  for (let segment of path) {
    if (typeof segment === "string") {
      if (node.type !== "object" || !Array.isArray(node.children)) {
        return void 0;
      }
      let found = false;
      for (const propertyNode of node.children) {
        if (Array.isArray(propertyNode.children) && propertyNode.children[0].value === segment && propertyNode.children.length === 2) {
          node = propertyNode.children[1];
          found = true;
          break;
        }
      }
      if (!found) {
        return void 0;
      }
    } else {
      const index = segment;
      if (node.type !== "array" || index < 0 || !Array.isArray(node.children) || index >= node.children.length) {
        return void 0;
      }
      node = node.children[index];
    }
  }
  return node;
}
function visit(text2, visitor, options = ParseOptions.DEFAULT) {
  const _scanner = createScanner(text2, false);
  const _jsonPath = [];
  let suppressedCallbacks = 0;
  function toNoArgVisit(visitFunction) {
    return visitFunction ? () => suppressedCallbacks === 0 && visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter()) : () => true;
  }
  function toOneArgVisit(visitFunction) {
    return visitFunction ? (arg) => suppressedCallbacks === 0 && visitFunction(arg, _scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter()) : () => true;
  }
  function toOneArgVisitWithPath(visitFunction) {
    return visitFunction ? (arg) => suppressedCallbacks === 0 && visitFunction(arg, _scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter(), () => _jsonPath.slice()) : () => true;
  }
  function toBeginVisit(visitFunction) {
    return visitFunction ? () => {
      if (suppressedCallbacks > 0) {
        suppressedCallbacks++;
      } else {
        let cbReturn = visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter(), () => _jsonPath.slice());
        if (cbReturn === false) {
          suppressedCallbacks = 1;
        }
      }
    } : () => true;
  }
  function toEndVisit(visitFunction) {
    return visitFunction ? () => {
      if (suppressedCallbacks > 0) {
        suppressedCallbacks--;
      }
      if (suppressedCallbacks === 0) {
        visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength(), _scanner.getTokenStartLine(), _scanner.getTokenStartCharacter());
      }
    } : () => true;
  }
  const onObjectBegin = toBeginVisit(visitor.onObjectBegin), onObjectProperty = toOneArgVisitWithPath(visitor.onObjectProperty), onObjectEnd = toEndVisit(visitor.onObjectEnd), onArrayBegin = toBeginVisit(visitor.onArrayBegin), onArrayEnd = toEndVisit(visitor.onArrayEnd), onLiteralValue = toOneArgVisitWithPath(visitor.onLiteralValue), onSeparator = toOneArgVisit(visitor.onSeparator), onComment = toNoArgVisit(visitor.onComment), onError = toOneArgVisit(visitor.onError);
  const disallowComments = options && options.disallowComments;
  const allowTrailingComma = options && options.allowTrailingComma;
  function scanNext() {
    while (true) {
      const token = _scanner.scan();
      switch (_scanner.getTokenError()) {
        case 4:
          handleError(
            14
            /* ParseErrorCode.InvalidUnicode */
          );
          break;
        case 5:
          handleError(
            15
            /* ParseErrorCode.InvalidEscapeCharacter */
          );
          break;
        case 3:
          handleError(
            13
            /* ParseErrorCode.UnexpectedEndOfNumber */
          );
          break;
        case 1:
          if (!disallowComments) {
            handleError(
              11
              /* ParseErrorCode.UnexpectedEndOfComment */
            );
          }
          break;
        case 2:
          handleError(
            12
            /* ParseErrorCode.UnexpectedEndOfString */
          );
          break;
        case 6:
          handleError(
            16
            /* ParseErrorCode.InvalidCharacter */
          );
          break;
      }
      switch (token) {
        case 12:
        case 13:
          if (disallowComments) {
            handleError(
              10
              /* ParseErrorCode.InvalidCommentToken */
            );
          } else {
            onComment();
          }
          break;
        case 16:
          handleError(
            1
            /* ParseErrorCode.InvalidSymbol */
          );
          break;
        case 15:
        case 14:
          break;
        default:
          return token;
      }
    }
  }
  function handleError(error, skipUntilAfter = [], skipUntil2 = []) {
    onError(error);
    if (skipUntilAfter.length + skipUntil2.length > 0) {
      let token = _scanner.getToken();
      while (token !== 17) {
        if (skipUntilAfter.indexOf(token) !== -1) {
          scanNext();
          break;
        } else if (skipUntil2.indexOf(token) !== -1) {
          break;
        }
        token = scanNext();
      }
    }
  }
  function parseString2(isValue) {
    const value = _scanner.getTokenValue();
    if (isValue) {
      onLiteralValue(value);
    } else {
      onObjectProperty(value);
      _jsonPath.push(value);
    }
    scanNext();
    return true;
  }
  function parseLiteral() {
    switch (_scanner.getToken()) {
      case 11:
        const tokenValue = _scanner.getTokenValue();
        let value = Number(tokenValue);
        if (isNaN(value)) {
          handleError(
            2
            /* ParseErrorCode.InvalidNumberFormat */
          );
          value = 0;
        }
        onLiteralValue(value);
        break;
      case 7:
        onLiteralValue(null);
        break;
      case 8:
        onLiteralValue(true);
        break;
      case 9:
        onLiteralValue(false);
        break;
      default:
        return false;
    }
    scanNext();
    return true;
  }
  function parseProperty() {
    if (_scanner.getToken() !== 10) {
      handleError(3, [], [
        2,
        5
        /* SyntaxKind.CommaToken */
      ]);
      return false;
    }
    parseString2(false);
    if (_scanner.getToken() === 6) {
      onSeparator(":");
      scanNext();
      if (!parseValue2()) {
        handleError(4, [], [
          2,
          5
          /* SyntaxKind.CommaToken */
        ]);
      }
    } else {
      handleError(5, [], [
        2,
        5
        /* SyntaxKind.CommaToken */
      ]);
    }
    _jsonPath.pop();
    return true;
  }
  function parseObject() {
    onObjectBegin();
    scanNext();
    let needsComma = false;
    while (_scanner.getToken() !== 2 && _scanner.getToken() !== 17) {
      if (_scanner.getToken() === 5) {
        if (!needsComma) {
          handleError(4, [], []);
        }
        onSeparator(",");
        scanNext();
        if (_scanner.getToken() === 2 && allowTrailingComma) {
          break;
        }
      } else if (needsComma) {
        handleError(6, [], []);
      }
      if (!parseProperty()) {
        handleError(4, [], [
          2,
          5
          /* SyntaxKind.CommaToken */
        ]);
      }
      needsComma = true;
    }
    onObjectEnd();
    if (_scanner.getToken() !== 2) {
      handleError(7, [
        2
        /* SyntaxKind.CloseBraceToken */
      ], []);
    } else {
      scanNext();
    }
    return true;
  }
  function parseArray2() {
    onArrayBegin();
    scanNext();
    let isFirstElement = true;
    let needsComma = false;
    while (_scanner.getToken() !== 4 && _scanner.getToken() !== 17) {
      if (_scanner.getToken() === 5) {
        if (!needsComma) {
          handleError(4, [], []);
        }
        onSeparator(",");
        scanNext();
        if (_scanner.getToken() === 4 && allowTrailingComma) {
          break;
        }
      } else if (needsComma) {
        handleError(6, [], []);
      }
      if (isFirstElement) {
        _jsonPath.push(0);
        isFirstElement = false;
      } else {
        _jsonPath[_jsonPath.length - 1]++;
      }
      if (!parseValue2()) {
        handleError(4, [], [
          4,
          5
          /* SyntaxKind.CommaToken */
        ]);
      }
      needsComma = true;
    }
    onArrayEnd();
    if (!isFirstElement) {
      _jsonPath.pop();
    }
    if (_scanner.getToken() !== 4) {
      handleError(8, [
        4
        /* SyntaxKind.CloseBracketToken */
      ], []);
    } else {
      scanNext();
    }
    return true;
  }
  function parseValue2() {
    switch (_scanner.getToken()) {
      case 3:
        return parseArray2();
      case 1:
        return parseObject();
      case 10:
        return parseString2(true);
      default:
        return parseLiteral();
    }
  }
  scanNext();
  if (_scanner.getToken() === 17) {
    if (options.allowEmptyContent) {
      return true;
    }
    handleError(4, [], []);
    return false;
  }
  if (!parseValue2()) {
    handleError(4, [], []);
    return false;
  }
  if (_scanner.getToken() !== 17) {
    handleError(9, [], []);
  }
  return true;
}
function getNodeType(value) {
  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "string":
      return "string";
    case "object": {
      if (!value) {
        return "null";
      } else if (Array.isArray(value)) {
        return "array";
      }
      return "object";
    }
    default:
      return "null";
  }
}

// ../../node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/main.js
var ScanError;
(function(ScanError2) {
  ScanError2[ScanError2["None"] = 0] = "None";
  ScanError2[ScanError2["UnexpectedEndOfComment"] = 1] = "UnexpectedEndOfComment";
  ScanError2[ScanError2["UnexpectedEndOfString"] = 2] = "UnexpectedEndOfString";
  ScanError2[ScanError2["UnexpectedEndOfNumber"] = 3] = "UnexpectedEndOfNumber";
  ScanError2[ScanError2["InvalidUnicode"] = 4] = "InvalidUnicode";
  ScanError2[ScanError2["InvalidEscapeCharacter"] = 5] = "InvalidEscapeCharacter";
  ScanError2[ScanError2["InvalidCharacter"] = 6] = "InvalidCharacter";
})(ScanError || (ScanError = {}));
var SyntaxKind;
(function(SyntaxKind2) {
  SyntaxKind2[SyntaxKind2["OpenBraceToken"] = 1] = "OpenBraceToken";
  SyntaxKind2[SyntaxKind2["CloseBraceToken"] = 2] = "CloseBraceToken";
  SyntaxKind2[SyntaxKind2["OpenBracketToken"] = 3] = "OpenBracketToken";
  SyntaxKind2[SyntaxKind2["CloseBracketToken"] = 4] = "CloseBracketToken";
  SyntaxKind2[SyntaxKind2["CommaToken"] = 5] = "CommaToken";
  SyntaxKind2[SyntaxKind2["ColonToken"] = 6] = "ColonToken";
  SyntaxKind2[SyntaxKind2["NullKeyword"] = 7] = "NullKeyword";
  SyntaxKind2[SyntaxKind2["TrueKeyword"] = 8] = "TrueKeyword";
  SyntaxKind2[SyntaxKind2["FalseKeyword"] = 9] = "FalseKeyword";
  SyntaxKind2[SyntaxKind2["StringLiteral"] = 10] = "StringLiteral";
  SyntaxKind2[SyntaxKind2["NumericLiteral"] = 11] = "NumericLiteral";
  SyntaxKind2[SyntaxKind2["LineCommentTrivia"] = 12] = "LineCommentTrivia";
  SyntaxKind2[SyntaxKind2["BlockCommentTrivia"] = 13] = "BlockCommentTrivia";
  SyntaxKind2[SyntaxKind2["LineBreakTrivia"] = 14] = "LineBreakTrivia";
  SyntaxKind2[SyntaxKind2["Trivia"] = 15] = "Trivia";
  SyntaxKind2[SyntaxKind2["Unknown"] = 16] = "Unknown";
  SyntaxKind2[SyntaxKind2["EOF"] = 17] = "EOF";
})(SyntaxKind || (SyntaxKind = {}));
var parse2 = parse;
var parseTree2 = parseTree;
var findNodeAtLocation2 = findNodeAtLocation;
var ParseErrorCode;
(function(ParseErrorCode2) {
  ParseErrorCode2[ParseErrorCode2["InvalidSymbol"] = 1] = "InvalidSymbol";
  ParseErrorCode2[ParseErrorCode2["InvalidNumberFormat"] = 2] = "InvalidNumberFormat";
  ParseErrorCode2[ParseErrorCode2["PropertyNameExpected"] = 3] = "PropertyNameExpected";
  ParseErrorCode2[ParseErrorCode2["ValueExpected"] = 4] = "ValueExpected";
  ParseErrorCode2[ParseErrorCode2["ColonExpected"] = 5] = "ColonExpected";
  ParseErrorCode2[ParseErrorCode2["CommaExpected"] = 6] = "CommaExpected";
  ParseErrorCode2[ParseErrorCode2["CloseBraceExpected"] = 7] = "CloseBraceExpected";
  ParseErrorCode2[ParseErrorCode2["CloseBracketExpected"] = 8] = "CloseBracketExpected";
  ParseErrorCode2[ParseErrorCode2["EndOfFileExpected"] = 9] = "EndOfFileExpected";
  ParseErrorCode2[ParseErrorCode2["InvalidCommentToken"] = 10] = "InvalidCommentToken";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfComment"] = 11] = "UnexpectedEndOfComment";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfString"] = 12] = "UnexpectedEndOfString";
  ParseErrorCode2[ParseErrorCode2["UnexpectedEndOfNumber"] = 13] = "UnexpectedEndOfNumber";
  ParseErrorCode2[ParseErrorCode2["InvalidUnicode"] = 14] = "InvalidUnicode";
  ParseErrorCode2[ParseErrorCode2["InvalidEscapeCharacter"] = 15] = "InvalidEscapeCharacter";
  ParseErrorCode2[ParseErrorCode2["InvalidCharacter"] = 16] = "InvalidCharacter";
})(ParseErrorCode || (ParseErrorCode = {}));

// ../../node_modules/.pnpm/smol-toml@1.3.1/node_modules/smol-toml/dist/error.js
function getLineColFromPtr(string, ptr) {
  let lines = string.slice(0, ptr).split(/\r\n|\n|\r/g);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r\n|\n|\r/g);
  let codeblock = "";
  let numberLen = (Math.log10(line + 1) | 0) + 1;
  for (let i = line - 1; i <= line + 1; i++) {
    let l = lines[i - 1];
    if (!l)
      continue;
    codeblock += i.toString().padEnd(numberLen, " ");
    codeblock += ":  ";
    codeblock += l;
    codeblock += "\n";
    if (i === line) {
      codeblock += " ".repeat(numberLen + column + 2);
      codeblock += "^\n";
    }
  }
  return codeblock;
}
var TomlError = class extends Error {
  line;
  column;
  codeblock;
  constructor(message, options) {
    const [line, column] = getLineColFromPtr(options.toml, options.ptr);
    const codeblock = makeCodeBlock(options.toml, line, column);
    super(`Invalid TOML document: ${message}

${codeblock}`, options);
    this.line = line;
    this.column = column;
    this.codeblock = codeblock;
  }
};

// ../../node_modules/.pnpm/smol-toml@1.3.1/node_modules/smol-toml/dist/util.js
function indexOfNewline(str, start = 0, end = str.length) {
  let idx = str.indexOf("\n", start);
  if (str[idx - 1] === "\r")
    idx--;
  return idx <= end ? idx : -1;
}
function skipComment(str, ptr) {
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "\n")
      return i;
    if (c === "\r" && str[i + 1] === "\n")
      return i + 1;
    if (c < " " && c !== "	" || c === "\x7F") {
      throw new TomlError("control characters are not allowed in comments", {
        toml: str,
        ptr
      });
    }
  }
  return str.length;
}
function skipVoid(str, ptr, banNewLines, banComments) {
  let c;
  while ((c = str[ptr]) === " " || c === "	" || !banNewLines && (c === "\n" || c === "\r" && str[ptr + 1] === "\n"))
    ptr++;
  return banComments || c !== "#" ? ptr : skipVoid(str, skipComment(str, ptr), banNewLines);
}
function skipUntil(str, ptr, sep3, end, banNewLines = false) {
  if (!end) {
    ptr = indexOfNewline(str, ptr);
    return ptr < 0 ? str.length : ptr;
  }
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "#") {
      i = indexOfNewline(str, i);
    } else if (c === sep3) {
      return i + 1;
    } else if (c === end) {
      return i;
    } else if (banNewLines && (c === "\n" || c === "\r" && str[i + 1] === "\n")) {
      return i;
    }
  }
  throw new TomlError("cannot find end of structure", {
    toml: str,
    ptr
  });
}
function getStringEnd(str, seek) {
  let first = str[seek];
  let target = first === str[seek + 1] && str[seek + 1] === str[seek + 2] ? str.slice(seek, seek + 3) : first;
  seek += target.length - 1;
  do
    seek = str.indexOf(target, ++seek);
  while (seek > -1 && first !== "'" && str[seek - 1] === "\\" && str[seek - 2] !== "\\");
  if (seek > -1) {
    seek += target.length;
    if (target.length > 1) {
      if (str[seek] === first)
        seek++;
      if (str[seek] === first)
        seek++;
    }
  }
  return seek;
}

// ../../node_modules/.pnpm/smol-toml@1.3.1/node_modules/smol-toml/dist/date.js
var DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}:\d{2}(?:\.\d+)?)?(Z|[-+]\d{2}:\d{2})?$/i;
var TomlDate = class _TomlDate extends Date {
  #hasDate = false;
  #hasTime = false;
  #offset = null;
  constructor(date) {
    let hasDate = true;
    let hasTime = true;
    let offset = "Z";
    if (typeof date === "string") {
      let match = date.match(DATE_TIME_RE);
      if (match) {
        if (!match[1]) {
          hasDate = false;
          date = `0000-01-01T${date}`;
        }
        hasTime = !!match[2];
        if (match[2] && +match[2] > 23) {
          date = "";
        } else {
          offset = match[3] || null;
          date = date.toUpperCase();
          if (!offset && hasTime)
            date += "Z";
        }
      } else {
        date = "";
      }
    }
    super(date);
    if (!isNaN(this.getTime())) {
      this.#hasDate = hasDate;
      this.#hasTime = hasTime;
      this.#offset = offset;
    }
  }
  isDateTime() {
    return this.#hasDate && this.#hasTime;
  }
  isLocal() {
    return !this.#hasDate || !this.#hasTime || !this.#offset;
  }
  isDate() {
    return this.#hasDate && !this.#hasTime;
  }
  isTime() {
    return this.#hasTime && !this.#hasDate;
  }
  isValid() {
    return this.#hasDate || this.#hasTime;
  }
  toISOString() {
    let iso = super.toISOString();
    if (this.isDate())
      return iso.slice(0, 10);
    if (this.isTime())
      return iso.slice(11, 23);
    if (this.#offset === null)
      return iso.slice(0, -1);
    if (this.#offset === "Z")
      return iso;
    let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
    offset = this.#offset[0] === "-" ? offset : -offset;
    let offsetDate = new Date(this.getTime() - offset * 6e4);
    return offsetDate.toISOString().slice(0, -1) + this.#offset;
  }
  static wrapAsOffsetDateTime(jsDate, offset = "Z") {
    let date = new _TomlDate(jsDate);
    date.#offset = offset;
    return date;
  }
  static wrapAsLocalDateTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#offset = null;
    return date;
  }
  static wrapAsLocalDate(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasTime = false;
    date.#offset = null;
    return date;
  }
  static wrapAsLocalTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasDate = false;
    date.#offset = null;
    return date;
  }
};

// ../../node_modules/.pnpm/smol-toml@1.3.1/node_modules/smol-toml/dist/primitive.js
var INT_REGEX = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
var FLOAT_REGEX = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
var LEADING_ZERO = /^[+-]?0[0-9_]/;
var ESCAPE_REGEX = /^[0-9a-f]{4,8}$/i;
var ESC_MAP = {
  b: "\b",
  t: "	",
  n: "\n",
  f: "\f",
  r: "\r",
  '"': '"',
  "\\": "\\"
};
function parseString(str, ptr = 0, endPtr = str.length) {
  let isLiteral = str[ptr] === "'";
  let isMultiline = str[ptr++] === str[ptr] && str[ptr] === str[ptr + 1];
  if (isMultiline) {
    endPtr -= 2;
    if (str[ptr += 2] === "\r")
      ptr++;
    if (str[ptr] === "\n")
      ptr++;
  }
  let tmp = 0;
  let isEscape;
  let parsed = "";
  let sliceStart = ptr;
  while (ptr < endPtr - 1) {
    let c = str[ptr++];
    if (c === "\n" || c === "\r" && str[ptr] === "\n") {
      if (!isMultiline) {
        throw new TomlError("newlines are not allowed in strings", {
          toml: str,
          ptr: ptr - 1
        });
      }
    } else if (c < " " && c !== "	" || c === "\x7F") {
      throw new TomlError("control characters are not allowed in strings", {
        toml: str,
        ptr: ptr - 1
      });
    }
    if (isEscape) {
      isEscape = false;
      if (c === "u" || c === "U") {
        let code = str.slice(ptr, ptr += c === "u" ? 4 : 8);
        if (!ESCAPE_REGEX.test(code)) {
          throw new TomlError("invalid unicode escape", {
            toml: str,
            ptr: tmp
          });
        }
        try {
          parsed += String.fromCodePoint(parseInt(code, 16));
        } catch {
          throw new TomlError("invalid unicode escape", {
            toml: str,
            ptr: tmp
          });
        }
      } else if (isMultiline && (c === "\n" || c === " " || c === "	" || c === "\r")) {
        ptr = skipVoid(str, ptr - 1, true);
        if (str[ptr] !== "\n" && str[ptr] !== "\r") {
          throw new TomlError("invalid escape: only line-ending whitespace may be escaped", {
            toml: str,
            ptr: tmp
          });
        }
        ptr = skipVoid(str, ptr);
      } else if (c in ESC_MAP) {
        parsed += ESC_MAP[c];
      } else {
        throw new TomlError("unrecognized escape sequence", {
          toml: str,
          ptr: tmp
        });
      }
      sliceStart = ptr;
    } else if (!isLiteral && c === "\\") {
      tmp = ptr - 1;
      isEscape = true;
      parsed += str.slice(sliceStart, tmp);
    }
  }
  return parsed + str.slice(sliceStart, endPtr - 1);
}
function parseValue(value, toml, ptr) {
  if (value === "true")
    return true;
  if (value === "false")
    return false;
  if (value === "-inf")
    return -Infinity;
  if (value === "inf" || value === "+inf")
    return Infinity;
  if (value === "nan" || value === "+nan" || value === "-nan")
    return NaN;
  if (value === "-0")
    return 0;
  let isInt;
  if ((isInt = INT_REGEX.test(value)) || FLOAT_REGEX.test(value)) {
    if (LEADING_ZERO.test(value)) {
      throw new TomlError("leading zeroes are not allowed", {
        toml,
        ptr
      });
    }
    let numeric = +value.replace(/_/g, "");
    if (isNaN(numeric)) {
      throw new TomlError("invalid number", {
        toml,
        ptr
      });
    }
    if (isInt && !Number.isSafeInteger(numeric)) {
      throw new TomlError("integer value cannot be represented losslessly", {
        toml,
        ptr
      });
    }
    return numeric;
  }
  let date = new TomlDate(value);
  if (!date.isValid()) {
    throw new TomlError("invalid value", {
      toml,
      ptr
    });
  }
  return date;
}

// ../../node_modules/.pnpm/smol-toml@1.3.1/node_modules/smol-toml/dist/extract.js
function sliceAndTrimEndOf(str, startPtr, endPtr, allowNewLines) {
  let value = str.slice(startPtr, endPtr);
  let commentIdx = value.indexOf("#");
  if (commentIdx > -1) {
    skipComment(str, commentIdx);
    value = value.slice(0, commentIdx);
  }
  let trimmed = value.trimEnd();
  if (!allowNewLines) {
    let newlineIdx = value.indexOf("\n", trimmed.length);
    if (newlineIdx > -1) {
      throw new TomlError("newlines are not allowed in inline tables", {
        toml: str,
        ptr: startPtr + newlineIdx
      });
    }
  }
  return [trimmed, commentIdx];
}
function extractValue(str, ptr, end, depth) {
  if (depth === 0) {
    throw new TomlError("document contains excessively nested structures. aborting.", {
      toml: str,
      ptr
    });
  }
  let c = str[ptr];
  if (c === "[" || c === "{") {
    let [value, endPtr2] = c === "[" ? parseArray(str, ptr, depth) : parseInlineTable(str, ptr, depth);
    let newPtr = skipUntil(str, endPtr2, ",", end);
    if (end === "}") {
      let nextNewLine = indexOfNewline(str, endPtr2, newPtr);
      if (nextNewLine > -1) {
        throw new TomlError("newlines are not allowed in inline tables", {
          toml: str,
          ptr: nextNewLine
        });
      }
    }
    return [value, newPtr];
  }
  let endPtr;
  if (c === '"' || c === "'") {
    endPtr = getStringEnd(str, ptr);
    let parsed = parseString(str, ptr, endPtr);
    if (end) {
      endPtr = skipVoid(str, endPtr, end !== "]");
      if (str[endPtr] && str[endPtr] !== "," && str[endPtr] !== end && str[endPtr] !== "\n" && str[endPtr] !== "\r") {
        throw new TomlError("unexpected character encountered", {
          toml: str,
          ptr: endPtr
        });
      }
      endPtr += +(str[endPtr] === ",");
    }
    return [parsed, endPtr];
  }
  endPtr = skipUntil(str, ptr, ",", end);
  let slice = sliceAndTrimEndOf(str, ptr, endPtr - +(str[endPtr - 1] === ","), end === "]");
  if (!slice[0]) {
    throw new TomlError("incomplete key-value declaration: no value specified", {
      toml: str,
      ptr
    });
  }
  if (end && slice[1] > -1) {
    endPtr = skipVoid(str, ptr + slice[1]);
    endPtr += +(str[endPtr] === ",");
  }
  return [
    parseValue(slice[0], str, ptr),
    endPtr
  ];
}

// ../../node_modules/.pnpm/smol-toml@1.3.1/node_modules/smol-toml/dist/struct.js
var KEY_PART_RE = /^[a-zA-Z0-9-_]+[ \t]*$/;
function parseKey(str, ptr, end = "=") {
  let dot = ptr - 1;
  let parsed = [];
  let endPtr = str.indexOf(end, ptr);
  if (endPtr < 0) {
    throw new TomlError("incomplete key-value: cannot find end of key", {
      toml: str,
      ptr
    });
  }
  do {
    let c = str[ptr = ++dot];
    if (c !== " " && c !== "	") {
      if (c === '"' || c === "'") {
        if (c === str[ptr + 1] && c === str[ptr + 2]) {
          throw new TomlError("multiline strings are not allowed in keys", {
            toml: str,
            ptr
          });
        }
        let eos = getStringEnd(str, ptr);
        if (eos < 0) {
          throw new TomlError("unfinished string encountered", {
            toml: str,
            ptr
          });
        }
        dot = str.indexOf(".", eos);
        let strEnd = str.slice(eos, dot < 0 || dot > endPtr ? endPtr : dot);
        let newLine = indexOfNewline(strEnd);
        if (newLine > -1) {
          throw new TomlError("newlines are not allowed in keys", {
            toml: str,
            ptr: ptr + dot + newLine
          });
        }
        if (strEnd.trimStart()) {
          throw new TomlError("found extra tokens after the string part", {
            toml: str,
            ptr: eos
          });
        }
        if (endPtr < eos) {
          endPtr = str.indexOf(end, eos);
          if (endPtr < 0) {
            throw new TomlError("incomplete key-value: cannot find end of key", {
              toml: str,
              ptr
            });
          }
        }
        parsed.push(parseString(str, ptr, eos));
      } else {
        dot = str.indexOf(".", ptr);
        let part = str.slice(ptr, dot < 0 || dot > endPtr ? endPtr : dot);
        if (!KEY_PART_RE.test(part)) {
          throw new TomlError("only letter, numbers, dashes and underscores are allowed in keys", {
            toml: str,
            ptr
          });
        }
        parsed.push(part.trimEnd());
      }
    }
  } while (dot + 1 && dot < endPtr);
  return [parsed, skipVoid(str, endPtr + 1, true, true)];
}
function parseInlineTable(str, ptr, depth) {
  let res = {};
  let seen = /* @__PURE__ */ new Set();
  let c;
  let comma = 0;
  ptr++;
  while ((c = str[ptr++]) !== "}" && c) {
    if (c === "\n") {
      throw new TomlError("newlines are not allowed in inline tables", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#") {
      throw new TomlError("inline tables cannot contain comments", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === ",") {
      throw new TomlError("expected key-value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c !== " " && c !== "	") {
      let k;
      let t = res;
      let hasOwn = false;
      let [key, keyEndPtr] = parseKey(str, ptr - 1);
      for (let i = 0; i < key.length; i++) {
        if (i)
          t = hasOwn ? t[k] : t[k] = {};
        k = key[i];
        if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
          throw new TomlError("trying to redefine an already defined value", {
            toml: str,
            ptr
          });
        }
        if (!hasOwn && k === "__proto__") {
          Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        }
      }
      if (hasOwn) {
        throw new TomlError("trying to redefine an already defined value", {
          toml: str,
          ptr
        });
      }
      let [value, valueEndPtr] = extractValue(str, keyEndPtr, "}", depth - 1);
      seen.add(value);
      t[k] = value;
      ptr = valueEndPtr;
      comma = str[ptr - 1] === "," ? ptr - 1 : 0;
    }
  }
  if (comma) {
    throw new TomlError("trailing commas are not allowed in inline tables", {
      toml: str,
      ptr: comma
    });
  }
  if (!c) {
    throw new TomlError("unfinished table encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}
function parseArray(str, ptr, depth) {
  let res = [];
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "]" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "	" && c !== "\n" && c !== "\r") {
      let e = extractValue(str, ptr - 1, "]", depth - 1);
      res.push(e[0]);
      ptr = e[1];
    }
  }
  if (!c) {
    throw new TomlError("unfinished array encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}

// ../../node_modules/.pnpm/smol-toml@1.3.1/node_modules/smol-toml/dist/parse.js
function peekTable(key, table2, meta, type) {
  let t = table2;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i = 0; i < key.length; i++) {
    if (i) {
      t = hasOwn ? t[k] : t[k] = {};
      m = (state = m[k]).c;
      if (type === 0 && (state.t === 1 || state.t === 2)) {
        return null;
      }
      if (state.t === 2) {
        let l = t.length - 1;
        t = t[l];
        m = m[l].c;
      }
    }
    k = key[i];
    if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
      return null;
    }
    if (!hasOwn) {
      if (k === "__proto__") {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i < key.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: {}
      };
    }
  }
  state = m[k];
  if (state.t !== type && !(type === 1 && state.t === 3)) {
    return null;
  }
  if (type === 2) {
    if (!state.d) {
      state.d = true;
      t[k] = [];
    }
    t[k].push(t = {});
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: {} };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t = hasOwn ? t[k] : t[k] = {};
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t, state.c];
}
function parse3(toml, opts) {
  let maxDepth = opts?.maxDepth ?? 1e3;
  let res = {};
  let meta = {};
  let tbl = res;
  let m = meta;
  for (let ptr = skipVoid(toml, 0); ptr < toml.length; ) {
    if (toml[ptr] === "[") {
      let isTableArray = toml[++ptr] === "[";
      let k = parseKey(toml, ptr += +isTableArray, "]");
      if (isTableArray) {
        if (toml[k[1] - 1] !== "]") {
          throw new TomlError("expected end of table declaration", {
            toml,
            ptr: k[1] - 1
          });
        }
        k[1]++;
      }
      let p = peekTable(
        k[0],
        res,
        meta,
        isTableArray ? 2 : 1
        /* Type.EXPLICIT */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      m = p[2];
      tbl = p[1];
      ptr = k[1];
    } else {
      let k = parseKey(toml, ptr);
      let p = peekTable(
        k[0],
        tbl,
        m,
        0
        /* Type.DOTTED */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      let v = extractValue(toml, k[1], void 0, maxDepth);
      p[1][p[0]] = v[0];
      ptr = v[1];
    }
    ptr = skipVoid(toml, ptr, true);
    if (toml[ptr] && toml[ptr] !== "\n" && toml[ptr] !== "\r") {
      throw new TomlError("each key-value declaration must be followed by an end-of-line", {
        toml,
        ptr
      });
    }
    ptr = skipVoid(toml, ptr);
  }
  return res;
}

// ../core/src/parsers/positions.ts
var LineIndex = class {
  constructor(text2) {
    this.text = text2;
    for (let i = 0; i < text2.length; i++) if (text2.charCodeAt(i) === 10) this.starts.push(i + 1);
  }
  starts = [0];
  pos(offset) {
    let lo = 0, hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (this.starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo, col: offset - this.starts[lo] };
  }
  range(start, end) {
    const a = this.pos(start), b = this.pos(end);
    return { startLine: a.line, startCol: a.col, endLine: b.line, endCol: b.col };
  }
  offsetOf(line, col) {
    return (this.starts[line] ?? this.text.length) + col;
  }
};

// ../core/src/parsers/parse.ts
var MAX_DEPTH = 64;
function depthOk(v, d = 0) {
  if (d > MAX_DEPTH) return false;
  if (v && typeof v === "object") {
    for (const c of Object.values(v)) if (!depthOk(c, d + 1)) return false;
  }
  return true;
}
function makeJsoncFile(path, kind, text2) {
  const idx = new LineIndex(text2);
  const errors = [];
  let tree;
  let parsed;
  let parseError;
  let parseWarning;
  try {
    parsed = parse2(text2, errors, { allowTrailingComma: true });
    tree = parseTree2(text2, [], { allowTrailingComma: true });
    if (!depthOk(parsed)) {
      parsed = void 0;
      parseError = "nesting too deep";
    } else if (parsed === void 0 || parsed === null || typeof parsed !== "object") parseError = "invalid JSON";
    else if (errors.length) parseWarning = `${errors.length} syntax error(s); analysis is partial`;
  } catch (e) {
    parseError = String(e);
  }
  return {
    path,
    kind,
    text: text2,
    parsed,
    parseError,
    parseWarning,
    locate(p) {
      if (!tree) return void 0;
      const n = findNodeAtLocation2(tree, p);
      if (!n) return void 0;
      const start = n.parent?.type === "property" ? n.parent.offset : n.offset;
      return idx.range(start, n.offset + n.length);
    }
  };
}
function makeTomlFile(path, kind, text2) {
  const idx = new LineIndex(text2);
  let parsed;
  let parseError;
  try {
    parsed = parse3(text2);
    if (!depthOk(parsed)) {
      parsed = void 0;
      parseError = "nesting too deep";
    }
  } catch (e) {
    parseError = String(e);
  }
  const lines = text2.split("\n");
  return {
    path,
    kind,
    text: text2,
    parsed,
    parseError,
    locate(p) {
      const key = String(p[p.length - 1]);
      const table2 = p.slice(0, -1).join(".");
      let inTable = table2 === "";
      let offset = 0;
      for (const line of lines) {
        const t = line.trim();
        const h = /^\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/.exec(t);
        if (h) inTable = h[1].replace(/["'\s]/g, "") === table2;
        else if (inTable && t.startsWith(key) && /^\s*=/.test(t.slice(key.length))) {
          return idx.range(offset, offset + line.replace(/\r$/, "").length);
        }
        offset += line.length + 1;
      }
      const tl = lines.findIndex((l) => l.replace(/["'\s]/g, "").startsWith(`[${p.join(".")}]`));
      if (tl >= 0) return idx.range(idx.offsetOf(tl, 0), idx.offsetOf(tl, lines[tl].replace(/\r$/, "").length));
      return void 0;
    }
  };
}
function makeTextFile(path, kind, text2) {
  return { path, kind, text: text2, locate: () => void 0 };
}
var STRUCTURED = [
  "claude-settings",
  "claude-local-settings",
  "mcp-json",
  "cursor-mcp",
  "vscode-mcp",
  "vscode-tasks",
  "gemini-settings",
  "claude-desktop-config"
];
function parseFile(path, kind, text2) {
  if (kind === "codex-config") return makeTomlFile(path, kind, text2);
  if (STRUCTURED.includes(kind)) return makeJsoncFile(path, kind, text2);
  return makeTextFile(path, kind, text2);
}

// ../core/src/discovery/patterns.ts
var FILE_PATTERNS = [
  { re: /^\.claude\/settings\.local\.json$/, kind: "claude-local-settings" },
  { re: /^\.claude\/settings\.json$/, kind: "claude-settings" },
  { re: /^\.claude\/skills\/.+\/SKILL\.md$/, kind: "skill-md" },
  { re: /^\.claude\/(agents|commands)\/.+\.md$/, kind: "instruction-md" },
  { re: /(^|\/)\.mcp\.json$/, kind: "mcp-json" },
  { re: /^\.cursor\/mcp\.json$/, kind: "cursor-mcp" },
  { re: /^\.github\/mcp\.json$/, kind: "mcp-json" },
  { re: /^\.vscode\/mcp\.json$/, kind: "vscode-mcp" },
  { re: /^\.vscode\/tasks\.json$/, kind: "vscode-tasks" },
  { re: /^\.codex\/config\.toml$/, kind: "codex-config" },
  { re: /^\.gemini\/settings\.json$/, kind: "gemini-settings" },
  { re: /(^|\/)(CLAUDE|CLAUDE\.local|AGENTS|GEMINI)\.md$/, kind: "instruction-md" },
  { re: /^\.cursorrules$/, kind: "cursor-rule" },
  { re: /^\.cursor\/rules\/.+\.mdc?$/, kind: "cursor-rule" },
  { re: /^\.github\/copilot-instructions\.md$/, kind: "copilot-instructions" },
  { re: /^\.github\/instructions\/.+/, kind: "copilot-instructions" },
  { re: /^\.windsurfrules$/, kind: "windsurf-rules" },
  { re: /^\.windsurf\/rules\/.+/, kind: "windsurf-rules" },
  { re: /^\.clinerules$/, kind: "cline-rules" },
  { re: /^\.clinerules\/.+/, kind: "cline-rules" },
  { re: /(?:^|\/)(?:\.npmrc|\.yarnrc\.yml|pip\.conf|uv\.toml)$/, kind: "pkg-registry-config" }
];
function classifyPath(path) {
  for (const p of FILE_PATTERNS) if (p.re.test(path)) return p.kind;
  return void 0;
}
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", "out", ".venv", "venv", "target", ".next"]);

// ../core/src/discovery/discover.ts
var MAX_DEPTH2 = 12;
function discover(root, opts = {}) {
  const cap2 = (opts.maxFileSizeKb ?? 1024) * 1024;
  const maxFiles = opts.maxFiles ?? 2e3;
  const files = [];
  const skipped = [];
  const walk = (rel, depth) => {
    if (depth > MAX_DEPTH2) return;
    let entries;
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((x, y) => x.name < y.name ? -1 : x.name > y.name ? 1 : 0);
    for (const ent of entries) {
      const name = ent.name;
      const relPath = rel ? `${rel}/${name}` : name;
      if (ent.isSymbolicLink()) {
        if (classifyPath(relPath)) skipped.push({ path: relPath, reason: "symlink" });
        continue;
      }
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(relPath, depth + 1);
        continue;
      }
      if (!ent.isFile()) continue;
      const kind = classifyPath(relPath);
      if (!kind) continue;
      const abs = join(root, relPath);
      let size;
      try {
        size = lstatSync2(abs).size;
      } catch {
        continue;
      }
      if (size > cap2) {
        skipped.push({ path: relPath, reason: "too large" });
        continue;
      }
      if (files.length >= maxFiles) {
        skipped.push({ path: relPath, reason: "file limit" });
        continue;
      }
      try {
        files.push(parseFile(relPath, kind, readFileSync2(abs, "utf8")));
      } catch {
        skipped.push({ path: relPath, reason: "unreadable" });
      }
    }
  };
  walk("", 0);
  return { files, skipped };
}
function userLevelCandidates(platform = process.platform) {
  const desktop = platform === "win32" ? "AppData/Roaming/Claude/claude_desktop_config.json" : platform === "darwin" ? "Library/Application Support/Claude/claude_desktop_config.json" : ".config/Claude/claude_desktop_config.json";
  return [
    { rel: ".claude/settings.json", kind: "claude-local-settings" },
    // personal file: treated like local settings
    { rel: ".claude.json", kind: "mcp-json" },
    { rel: ".codex/config.toml", kind: "codex-config" },
    { rel: ".cursor/mcp.json", kind: "cursor-mcp" },
    { rel: desktop, kind: "claude-desktop-config" }
  ];
}
function discoverUserLevel(home, opts = {}) {
  const cap2 = (opts.maxFileSizeKb ?? 1024) * 1024;
  const files = [];
  const skipped = [];
  for (const c of userLevelCandidates(opts.platform)) {
    const abs = join(home, c.rel);
    const label = "~/" + c.rel;
    try {
      const st = lstatSync2(abs);
      if (st.isSymbolicLink() || !st.isFile()) continue;
      if (st.size > cap2) {
        skipped.push({ path: label, reason: "too large" });
        continue;
      }
      files.push(parseFile(label, c.kind, readFileSync2(abs, "utf8")));
    } catch {
    }
  }
  return { files, skipped };
}

// ../core/src/discovery/gitindex.ts
import { existsSync, lstatSync as lstatSync3, readFileSync as readFileSync3 } from "node:fs";
import { join as join2 } from "node:path";
function parseGitIndex(buf) {
  try {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (buf.length < 12 || String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== "DIRC") return void 0;
    const version = dv.getUint32(4);
    const count = dv.getUint32(8);
    if (version < 2 || version > 4 || count > 1e6) return void 0;
    const out = /* @__PURE__ */ new Set();
    let off = 12;
    let prev = "";
    for (let i = 0; i < count; i++) {
      const entryStart = off;
      if (off + 62 > buf.length) return void 0;
      const flags = dv.getUint16(off + 60);
      off += 62;
      if (version >= 3 && flags & 16384) off += 2;
      let path;
      if (version === 4) {
        let c = buf[off++];
        let strip = c & 127;
        while (c & 128) {
          c = buf[off++];
          strip = (strip + 1 << 7) + (c & 127);
        }
        let end = off;
        while (end < buf.length && buf[end] !== 0) end++;
        path = prev.slice(0, Math.max(0, prev.length - strip)) + new TextDecoder().decode(buf.subarray(off, end));
        off = end + 1;
        prev = path;
      } else {
        let end = off;
        while (end < buf.length && buf[end] !== 0) end++;
        path = new TextDecoder().decode(buf.subarray(off, end));
        const len = end - entryStart;
        off = entryStart + Math.ceil((len + 1) / 8) * 8;
      }
      if (flags >> 12 & 3) continue;
      out.add(path);
    }
    return out;
  } catch {
    return void 0;
  }
}
function readTrackedFiles(root) {
  const p = join2(root, ".git", "index");
  try {
    if (!existsSync(p) || lstatSync3(p).isSymbolicLink()) return void 0;
    return parseGitIndex(readFileSync3(p));
  } catch {
    return void 0;
  }
}

// ../core/src/model/types.ts
var SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"];
var sevRank = (s) => SEVERITY_ORDER.indexOf(s);

// ../core/src/unicode/hidden.ts
var ZW = /* @__PURE__ */ new Set([8203, 8204, 8205, 8288, 65279, 8289, 8290, 8291, 8292, 6158]);
function classify(cp) {
  if (ZW.has(cp)) return "zero-width";
  if (cp >= 8234 && cp <= 8238 || cp >= 8294 && cp <= 8297 || cp === 8206 || cp === 8207) return "bidi";
  if (cp >= 917504 && cp <= 917631) return "tag";
  if (cp >= 65024 && cp <= 65039 || cp >= 917760 && cp <= 917999) return "variation-selector";
  return void 0;
}
function isEmojiBase(cp) {
  return cp >= 127744 && cp <= 129791 || cp >= 126976 && cp <= 127743 || cp >= 9728 && cp <= 10175 || cp >= 8960 && cp <= 9215 || cp >= 11008 && cp <= 11263 || cp >= 127462 && cp <= 127487 || cp === 169 || cp === 174 || cp === 8252 || cp === 8265 || cp === 8482 || cp === 8505 || cp === 12336 || cp === 12349 || cp === 12951 || cp === 12953 || cp >= 8592 && cp <= 8703 || cp >= 9642 && cp <= 9726;
}
var isSkinTone = (cp) => cp >= 127995 && cp <= 127999;
function isJoiningScript(cp) {
  return cp >= 1536 && cp <= 1791 || cp >= 1872 && cp <= 1919 || cp >= 2304 && cp <= 3583 || cp >= 4096 && cp <= 4255 || cp >= 6016 && cp <= 6143;
}
function tagToAscii(cp) {
  const c = cp - 917504;
  return c >= 32 && c <= 126 ? String.fromCharCode(c) : "";
}
function isPrintableText(s) {
  return s.length > 0 && /^[\t\n\r\x20-\x7e]+$/.test(s);
}
function decodeRun(cps, kinds) {
  if (kinds.has("tag")) {
    const s = cps.map(tagToAscii).join("");
    if (s.length >= 3) return s;
  }
  const zwOnly = cps.filter((c) => classify(c) === "zero-width");
  if (zwOnly.length >= 16) {
    const counts = /* @__PURE__ */ new Map();
    for (const c of zwOnly) counts.set(c, (counts.get(c) ?? 0) + 1);
    const top = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 2).map(([c]) => c);
    if (top.length === 2) {
      const seq = zwOnly.filter((c) => c === top[0] || c === top[1]);
      for (const width of [8, 7]) {
        for (const oneIs of [top[1], top[0]]) {
          let out = "";
          for (let i = 0; i + width <= seq.length; i += width) {
            let b = 0;
            for (let j2 = 0; j2 < width; j2++) b = b << 1 | (seq[i + j2] === oneIs ? 1 : 0);
            out += String.fromCharCode(b);
          }
          if (out.length >= 4 && isPrintableText(out) && /[A-Za-z]{2}/.test(out)) return out;
        }
      }
    }
  }
  const vs = cps.filter((c) => c >= 65024 && c <= 65039 || c >= 917760 && c <= 917999);
  if (vs.length >= 3) {
    const out = vs.map((c) => String.fromCharCode(c >= 917760 ? c - 917760 + 16 : c - 65024)).join("");
    if (isPrintableText(out)) return out;
  }
  return void 0;
}
function findHidden(text2) {
  const runs = [];
  let cur;
  let prev = -1;
  let prevVisible = -1;
  let idx = 0;
  const flush = () => {
    if (!cur) return;
    const last = cur.cps[cur.cps.length - 1];
    const onlyTags = cur.kinds.size === 1 && cur.kinds.has("tag");
    const flag = onlyTags && last === 917631 && cur.before === 127988;
    if (!flag) {
      runs.push({
        start: cur.start,
        end: cur.end,
        kinds: [...cur.kinds],
        codepoints: cur.cps,
        decoded: decodeRun(cur.cps, cur.kinds)
      });
    }
    cur = void 0;
  };
  const chars = Array.from(text2);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const cp = ch.codePointAt(0);
    const kind = classify(cp);
    let benign = false;
    if (kind) {
      const next = i + 1 < chars.length ? chars[i + 1].codePointAt(0) : -1;
      if (cp === 65279 && idx === 0) benign = true;
      else if (cp === 8205 && (isEmojiBase(prevVisible) || isSkinTone(prevVisible) || prev === 65039) && isEmojiBase(next)) benign = true;
      else if ((cp === 8205 || cp === 8204) && isJoiningScript(prevVisible) && isJoiningScript(next)) benign = true;
      else if ((cp === 65039 || cp === 65038) && prevVisible >= 0 && (isEmojiBase(prevVisible) || /[0-9#*]/.test(String.fromCodePoint(prevVisible)))) benign = true;
    }
    if (kind && !benign) {
      if (!cur) cur = { start: idx, end: idx, cps: [], kinds: /* @__PURE__ */ new Set(), before: prevVisible };
      cur.cps.push(cp);
      cur.kinds.add(kind);
      cur.end = idx + ch.length;
    } else {
      flush();
    }
    if (!kind) prevVisible = cp;
    prev = cp;
    idx += ch.length;
  }
  flush();
  return runs;
}
function renderVisible(s) {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    out += classify(cp) ? `\u2039U+${cp.toString(16).toUpperCase().padStart(4, "0")}\u203A` : ch;
  }
  return out;
}

// ../core/src/rules/helpers.ts
var ZERO_RANGE = { startLine: 0, startCol: 0, endLine: 0, endCol: 0 };
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var isStr = (v) => typeof v === "string";
function clip(s, n = 200) {
  const one = s.replace(/\r?\n/g, "\u23CE ");
  return one.length > n ? one.slice(0, n) + "\u2026" : one;
}
function finding(meta, file, at, inp) {
  const range = inp.range ?? (at ? file.locate(at) : void 0) ?? ZERO_RANGE;
  const out = {
    ruleId: meta.id,
    severity: inp.severity ?? meta.defaultSeverity,
    confidence: inp.confidence,
    category: meta.category,
    title: inp.title ?? meta.title,
    whyItMatters: inp.whyItMatters,
    file: file.path,
    range,
    evidence: renderVisible(clip(inp.evidence, 900)),
    fix: inp.fix,
    jsonPath: (inp.jsonPath ?? at)?.join("."),
    ...inp.subject ? { subject: inp.subject } : {}
  };
  if (inp.autofix && inp.autofix.length) out.autofix = inp.autofix;
  if (meta.references) out.references = meta.references;
  if (meta.experimental) out.experimental = true;
  return out;
}
function defineRule(meta, appliesTo, run2) {
  return { id: meta.id, title: meta.title, category: meta.category, defaultSeverity: meta.defaultSeverity, appliesTo, experimental: meta.experimental, run: run2 };
}
var SETTINGS_KINDS = ["claude-settings", "claude-local-settings"];
var MCP_KINDS = ["mcp-json", "cursor-mcp", "vscode-mcp", "gemini-settings", "codex-config", "claude-desktop-config"];
var INSTRUCTION_KINDS = ["instruction-md", "cursor-rule", "copilot-instructions", "windsurf-rules", "cline-rules", "skill-md"];
var ALL_KINDS = [
  "claude-settings",
  "claude-local-settings",
  "mcp-json",
  "cursor-mcp",
  "vscode-mcp",
  "vscode-tasks",
  "codex-config",
  "gemini-settings",
  "instruction-md",
  "cursor-rule",
  "copilot-instructions",
  "windsurf-rules",
  "cline-rules",
  "skill-md",
  "claude-desktop-config",
  "pkg-registry-config"
];
function normalizeCmd(cmd) {
  return cmd.replace(/['"`^]/g, "").replace(/\\/g, "/").replace(/\s+/g, " ").trim().toLowerCase();
}
function normalizeCmdStrip(cmd) {
  return cmd.replace(/['"`\\^]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}
var NET = /(?<![\w./-])(?:curl|wget|nc|ncat|netcat|telnet|ftp|tftp|scp|invoke-webrequest|iwr|invoke-restmethod|irm|certutil|bitsadmin|start-bitstransfer|net\.webclient|downloadstring|downloadfile)(?![\w-])/;
var PIPE_SHELL = /\|\s*(?:sudo\s+)?(?:(?:ba|z|da|k|c)?sh|iex|invoke-expression|python3?|node|perl|ruby|powershell|pwsh|cmd)(?:\s+-s\b[^|;&]*|\s+-(?:\s[^|;&]*)?)?\s*(?=$|[|;&)<>])|\b(?:sh|bash|zsh)\s+<\(\s*(?:curl|wget)|\biex\b|invoke-expression|\beval\b\s*["'$(]?\s*\$\(\s*(?:curl|wget)/;
var ALT_RUN = /(?<![\w/.:%-])[a-z_]\w*(?:\|[a-z_]\w*){2,}(?![\w/.:-])/gi;
var ALT_PAREN = /\((?:\?:)?\s*[a-z_]\w*(?:\|[a-z_]\w*)+\s*\)/gi;
var unalt = (x) => x.replace(ALT_RUN, "ALT").replace(ALT_PAREN, "ALT");
var B64 = /base64\s+(?:-d|-D|--decode)|frombase64string|\bxxd\s+-r|certutil[^|;&]*-decode|\bopenssl\s+base64\s+-d/;
var INLINE = /(?<![\w./-])(?:node(?:js)?|bun|deno)\s+(?:--eval|-e|-p|--print)(?![\w-])|(?<![\w./-])python[\d.]*\s+-c(?![\w-])|(?<![\w./-])(?:perl|ruby|php)\s+-[er](?![\w-])|(?:powershell|pwsh)(?:\.exe)?\s[^|;&]*-(?:e|enc|encodedcommand|ec)(?![\w-])/;
var INLINE_SHELL = /(?<![\w./-])(?:ba|z|da)?sh\s+-c(?![\w-])|(?:cmd(?:\.exe)?)\s+\/[ck](?![\w-])/;
var SENSITIVE = /(?:\.ssh(?![\w-])|(?:^|[\s/="'(:@])\.env(?!\.(?:example|sample|template|dist|defaults?)(?![\w-]))(?:\.[\w-]+)?(?![\w-])|\.aws(?![\w-])|\.npmrc|\.netrc|\.git-credentials|\.docker\/config|\.config\/gcloud|id_(?:rsa|ed25519|ecdsa|dsa)|\.kube\/config|\.pypirc|\.gnupg|\.azure(?![\w-])|keychain|login\.keychain|credentials(?:\.json)?(?![\w-])|\/etc\/(?:passwd|shadow))/;
var REPO_SCRIPT = /(?:\$\{?(?:claude_project_dir|cursor_project_dir|workspacefolder|workspaceroot)\}?|(?:^|\s)\.\.?\/|(?:^|\s)\.claude\/|(?:^|\s)\.cursor\/|(?:^|\s)\.vscode\/|(?:^|\s)\.github\/)|(?:^|[\s;&|])(?:(?:ba|z|da)?sh|node|bun|deno|python[\d.]*|pwsh|powershell(?:\.exe)?|ruby|perl|php)\s+(?:-[\w-]+\s+)*[^\s|;&]+\.(?:sh|bash|js|mjs|cjs|ts|py|ps1|bat|cmd|rb|pl|php)(?![\w-])|^[\w./-]+\.(?:sh|bash|bat|cmd|ps1)(?:\s|$)/;
var READERS = /* @__PURE__ */ new Set(["cat", "head", "tail", "less", "more", "bat", "type", "wc", "ls", "dir", "echo", "printf", "test", "[", "[[", "grep", "egrep", "fgrep", "rg", "file", "stat", "true", "false", ":", "pwd"]);
var SEGMENT_SPLIT = /&&|\|\||[;|\n]|\bthen\b|\bdo\b|\belse\b|\bfi\b|\bdone\b/;
function executedSegments(raw) {
  const out = [];
  for (const part of raw.split(new RegExp(SEGMENT_SPLIT.source, "i"))) {
    const seg = part.trim().replace(/^(?:if|elif|while|until|!)\s+/i, "").replace(/^(?:\w+=\S*\s+)+/, "").replace(/^(?:sudo|time|nohup|command|builtin)\s+/i, "");
    if (!seg) continue;
    const word = seg.split(/\s+/)[0].replace(/^["'(]+|["')]+$/g, "").toLowerCase();
    if (!READERS.has(word)) out.push(seg);
  }
  return out;
}
function runsRepoScript(normalized) {
  for (const raw of normalized.split(SEGMENT_SPLIT)) {
    let seg = raw.trim().replace(/^(?:if|elif|while|until|!)\s+/, "").replace(/^(?:\w+=\S*\s+)+/, "").replace(/^(?:sudo|time|nohup|command|builtin)\s+/, "");
    if (!seg) continue;
    const word = seg.split(/\s+/)[0].replace(/^["'(]+|["')]+$/g, "");
    if (READERS.has(word)) continue;
    if (REPO_SCRIPT.test(seg)) return true;
  }
  return false;
}
function analyzeCommand(raw) {
  const text2 = raw.length > 8e3 ? raw.slice(0, 8e3) : raw;
  const n = normalizeCmd(text2);
  const n2 = normalizeCmdStrip(text2);
  const t = (re) => re.test(n) || re.test(n2);
  const network = t(NET);
  const pipeToShell = PIPE_SHELL.test(unalt(n)) || PIPE_SHELL.test(unalt(n2));
  const base64Exec = t(B64);
  const inlineInterp = t(INLINE);
  const shellWrapper = t(INLINE_SHELL);
  const stripSetup = (x) => x.replace(/\b(?:cp|copy)\s+(?:-\w+\s+)*\S*\.env\.(?:example|sample|template|dist)\s+\S*\.env\S*/g, "");
  const sensitiveRef = SENSITIVE.test(stripSetup(n)) || SENSITIVE.test(stripSetup(n2));
  const repoScript = runsRepoScript(n);
  const signals = [];
  if (network) signals.push("network tool");
  if (pipeToShell) signals.push("pipes into a shell/interpreter");
  if (base64Exec) signals.push("base64 decode");
  if (inlineInterp) signals.push("inline interpreter");
  if (shellWrapper) signals.push("shell -c wrapper");
  if (sensitiveRef) signals.push("references credential/secret paths");
  if (repoScript) signals.push("runs a script from the repository");
  let severity = "info";
  if (pipeToShell || network && sensitiveRef || base64Exec && (inlineInterp || network)) severity = "critical";
  else if (network || base64Exec || sensitiveRef || inlineInterp && !repoScript) severity = "high";
  else if (repoScript || inlineInterp || shellWrapper) severity = "medium";
  return { network, pipeToShell, base64Exec, inlineInterp, shellWrapper, sensitiveRef, repoScript, signals, severity };
}
function mcpServers(file) {
  const p = file.parsed;
  if (!isObj(p)) return [];
  const out = [];
  const take = (key) => {
    const m = p[key];
    if (isObj(m)) {
      for (const [name, def] of Object.entries(m)) if (isObj(def)) out.push({ name, path: [key, name], def });
    }
  };
  if (file.kind === "codex-config") take("mcp_servers");
  else if (file.kind === "vscode-mcp") {
    take("servers");
    take("mcpServers");
  } else {
    take("mcpServers");
    take("servers");
  }
  return out;
}
function strArgs(def) {
  return Array.isArray(def.args) ? def.args.filter(isStr) : [];
}
var SHELLS = /* @__PURE__ */ new Set(["bash", "sh", "zsh", "dash", "fish", "ksh", "csh", "tcsh", "cmd", "pwsh", "powershell"]);
var baseName = (c) => c.replace(/\\/g, "/").split("/").pop().replace(/\.(exe|cmd|bat)$/i, "").toLowerCase();
var isShell = (c) => SHELLS.has(baseName(c));
function effectiveLaunch(def) {
  const command = isStr(def.command) ? def.command : void 0;
  if (!command) return void 0;
  const args = strArgs(def);
  const b = baseName(command);
  if ((b === "cmd" || b === "powershell" || b === "pwsh" || SHELLS.has(b)) && args.length >= 2) {
    const flag = args[0].toLowerCase();
    if (["/c", "/k", "-c", "-command"].includes(flag)) {
      const inner = args[1];
      if (!/[|&;$`<>()\s]/.test(inner)) return { cmd: inner, args: args.slice(2), wrapper: b, argsOffset: 2 };
    }
  }
  return { cmd: command, args, argsOffset: 0 };
}
function parseHost(url) {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return void 0;
  }
}

// ../../product.json
var product_default = {
  name: "Tripwire",
  id: "tripwire",
  settingsPrefix: "tripwire",
  configFile: ".tripwire.json",
  legacyConfigFiles: [
    ".agentgate.json"
  ],
  lockFile: ".tripwire.lock",
  publisher: "tripwire-dev",
  copyrightHolder: "Tripwire contributors",
  docsUrl: "",
  ruleIdPrefix: "AG"
};

// ../core/src/product.ts
var PRODUCT = product_default;
function configFileCandidates(p = PRODUCT) {
  const out = [{ name: p.configFile, legacy: false }];
  for (const l of p.legacyConfigFiles) if (l !== p.configFile) out.push({ name: l, legacy: true });
  return out;
}

// ../core/src/rules/autofix.ts
function nodeAt(file, path) {
  const tree = parseTree2(file.text, [], { allowTrailingComma: true });
  const node = tree ? findNodeAtLocation2(tree, path) : void 0;
  return node ? { tree, node } : void 0;
}
function removeNodeEdits(file, path) {
  try {
    const found = nodeAt(file, path);
    if (!found) return [];
    const target = found.node.parent?.type === "property" ? found.node.parent : found.node;
    const container = target.parent;
    if (!container || !container.children) return [];
    const sibs = container.children;
    const i = sibs.indexOf(target);
    if (i < 0) return [];
    const idx = new LineIndex(file.text);
    const end = target.offset + target.length;
    let from = target.offset;
    let to = end;
    const text2 = file.text;
    if (i + 1 < sibs.length) {
      let j2 = end;
      while (j2 < text2.length && /\s/.test(text2[j2])) j2++;
      if (text2[j2] === ",") {
        let to2 = j2 + 1;
        while (to2 < text2.length && (text2[to2] === " " || text2[to2] === "	")) to2++;
        let ls = from;
        while (ls > 0 && (text2[ls - 1] === " " || text2[ls - 1] === "	")) ls--;
        const nl = text2[to2] === "\r" && text2[to2 + 1] === "\n" ? 2 : text2[to2] === "\n" ? 1 : 0;
        if ((ls === 0 || text2[ls - 1] === "\n") && nl) {
          from = ls;
          to2 += nl;
        }
        to = to2;
      } else {
        to = sibs[i + 1].offset;
      }
    } else if (i > 0) {
      from = sibs[i - 1].offset + sibs[i - 1].length;
    } else {
      let ls = from;
      while (ls > 0 && (text2[ls - 1] === " " || text2[ls - 1] === "	")) ls--;
      let te = to;
      while (te < text2.length && (text2[te] === " " || text2[te] === "	")) te++;
      const nl = text2[te] === "\r" && text2[te + 1] === "\n" ? 2 : text2[te] === "\n" ? 1 : 0;
      if ((ls === 0 || text2[ls - 1] === "\n") && nl) {
        from = ls;
        to = te + nl;
      }
    }
    return [{ range: idx.range(from, to), newText: "" }];
  } catch {
    return [];
  }
}
function setValueEdit(file, path, value) {
  try {
    const found = nodeAt(file, path);
    if (!found) return [];
    const idx = new LineIndex(file.text);
    return [{ range: idx.range(found.node.offset, found.node.offset + found.node.length), newText: JSON.stringify(value) }];
  } catch {
    return [];
  }
}
function replaceElementEdit(file, path, values) {
  const range = file.locate(path);
  if (!range) return [];
  return [{ range, newText: values.map((v) => JSON.stringify(v)).join(", ") }];
}
function substringRange(file, path, needle) {
  const r = file.locate(path);
  if (!r || !needle) return void 0;
  const idx = new LineIndex(file.text);
  const s = idx.offsetOf(r.startLine, r.startCol);
  const e = idx.offsetOf(r.endLine, r.endCol);
  const at = file.text.slice(s, e).indexOf(needle);
  return at < 0 ? void 0 : idx.range(s + at, s + at + needle.length);
}
var sanitizeVar = (s) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
function envRefEdit(file, path, secret) {
  if (file.kind === "codex-config" || file.parsed === void 0) return [];
  const range = substringRange(file, path, secret);
  if (!range) return [];
  const last = path[path.length - 1];
  const inEnv = path.includes("env");
  let name;
  if (inEnv && typeof last === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(last)) name = last.toUpperCase();
  else {
    const server = typeof path[1] === "string" ? sanitizeVar(path[1]) : "";
    const what = typeof last === "string" && path.includes("headers") ? sanitizeVar(last) : "TOKEN";
    name = [server, what === "AUTHORIZATION" ? "TOKEN" : what].filter(Boolean).join("_") || `${PRODUCT.id.toUpperCase()}_SECRET`;
  }
  return [{
    file: file.path,
    description: `Replace the hardcoded secret with \${${name}} (set ${name} in your environment, then revoke the leaked value)`,
    edits: [{ range, newText: `\${${name}}` }]
  }];
}

// ../core/src/intel/hosts.ts
var LOOPBACK_HOSTS = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);
var isLoopback = (host) => LOOPBACK_HOSTS.has(host.toLowerCase()) || /^127\.\d+\.\d+\.\d+$/.test(host) || host.toLowerCase().endsWith(".localhost");
var FIRST_PARTY_API_HOSTS = [
  { pattern: /^api\.anthropic\.com$/i, verified: true },
  { pattern: /^api\.openai\.com$/i, verified: true },
  { pattern: /^generativelanguage\.googleapis\.com$/i, verified: true },
  { pattern: /^([a-z0-9-]+-)?aiplatform\.googleapis\.com$/i, verified: false },
  { pattern: /^bedrock-runtime\.[a-z0-9-]+\.amazonaws\.com$/i, verified: false }
];
var isFirstPartyHost = (host) => FIRST_PARTY_API_HOSTS.some((h) => h.pattern.test(host));
var EXFIL_HOST_CLASSES = [
  { pattern: /(^|\.)webhook\.site$/i, cls: "webhook-capture", verified: false },
  { pattern: /(^|\.)requestbin\.com$/i, cls: "webhook-capture", verified: false },
  { pattern: /(^|\.)requestcatcher\.com$/i, cls: "webhook-capture", verified: false },
  { pattern: /(^|\.)pipedream\.net$/i, cls: "webhook-capture", verified: false },
  { pattern: /(^|\.)beeceptor\.com$/i, cls: "webhook-capture", verified: false },
  { pattern: /^(canary)?tokens\.org$/i, cls: "webhook-capture", verified: false },
  { pattern: /(^|\.)ngrok(-free)?\.(io|app|dev)$/i, cls: "tunnel", verified: false },
  { pattern: /(^|\.)trycloudflare\.com$/i, cls: "tunnel", verified: false },
  { pattern: /(^|\.)loca\.lt$/i, cls: "tunnel", verified: false },
  { pattern: /(^|\.)serveo\.net$/i, cls: "tunnel", verified: false },
  { pattern: /^discord(app)?\.com$/i, cls: "chat-webhook", verified: false },
  { pattern: /^hooks\.slack\.com$/i, cls: "chat-webhook", verified: false },
  { pattern: /^pastebin\.com$/i, cls: "paste", verified: false },
  { pattern: /(^|\.)transfer\.sh$/i, cls: "paste", verified: false },
  { pattern: /(^|\.)(oast\.(pro|live|site|online|fun|me)|interact\.sh|burpcollaborator\.net)$/i, cls: "oast", verified: false },
  { pattern: /\.invalid$/i, cls: "placeholder-invalid-tld", verified: true }
];
function exfilClass(host) {
  return EXFIL_HOST_CLASSES.find((h) => h.pattern.test(host))?.cls;
}
var WELL_KNOWN_MCP_PACKAGES = [
  { pattern: /^@modelcontextprotocol\//, verified: true },
  { pattern: /^mcp-server-(fetch|git|time|sqlite|memory)$/, verified: false },
  // Widely used, vendor-published MCP servers. Popularity judged by the author; not independently verified.
  { pattern: /^@anthropic-ai\//, verified: false },
  { pattern: /^@playwright\/mcp$/, verified: false },
  { pattern: /^@upstash\/context7-mcp$/, verified: false },
  { pattern: /^chrome-devtools-mcp$/, verified: false },
  { pattern: /^@notionhq\/notion-mcp-server$/, verified: false }
];
var isWellKnownMcpPackage = (name) => WELL_KNOWN_MCP_PACKAGES.some((p) => p.pattern.test(name));
var DEFAULT_REGISTRY_HOSTS = [
  { pattern: /^registry\.npmjs\.org$/i, verified: false },
  { pattern: /^registry\.yarnpkg\.com$/i, verified: false },
  { pattern: /^pypi\.org$/i, verified: false },
  { pattern: /^files\.pythonhosted\.org$/i, verified: false },
  { pattern: /^proxy\.golang\.org$/i, verified: false },
  { pattern: /^(?:index\.)?crates\.io$/i, verified: false },
  { pattern: /^(?:npm|nuget|rubygems|maven|gradle)\.pkg\.github\.com$/i, verified: false }
];
var isDefaultRegistryHost = (host) => DEFAULT_REGISTRY_HOSTS.some((h) => h.pattern.test(host));

// ../core/src/secrets/patterns.ts
var SECRET_PATTERNS = [
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { name: "GitHub fine-grained token", re: /\bgithub_pat_[A-Za-z0-9_]{22,255}\b/g },
  { name: "AWS access key ID", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "npm access token", re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { name: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,200}\b/g },
  { name: "Stripe key", re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,200}\b/g },
  { name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{32,200}\b/g },
  { name: "OpenAI API key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,200}\b/g },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "Private key block", re: /-----BEGIN [A-Z ]{0,30}PRIVATE KEY-----/g },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { name: "Credentials in URL", re: /\b[a-z][a-z0-9+.-]{1,12}:\/\/[^\s/:@$]{1,64}:[^\s/@$]{3,128}@[^\s/]{3,255}/gi },
  { name: "Secret in URL query", re: /[?&](?:api[_-]?key|access[_-]?token|token|secret|key)=[A-Za-z0-9._~+-]{16,200}(?=&|$|[\s"'])/gi }
];
var KNOWN_SAMPLES = [/AKIAIOSFODNN7EXAMPLE/, /wJalrXUtnFEMI/];
var isKnownSample = (s) => KNOWN_SAMPLES.some((r) => r.test(s));
function isEnvReference(v) {
  return /\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|%[A-Za-z_][A-Za-z0-9_]*%|^\$\(.*\)$/.test(v);
}
var SECRET_KEY_NAME = /(?:token|secret|passw(?:or)?d|passwd|api[_-]?key|apikey|auth|credential|private[_-]?key|bearer)/i;
var PLACEHOLDER = /^(?:<[^>]*>|\[.*\]|x{3,}|\*{3,}|\.{3,}|changeme|change[-_]me|your[-_ ].*|example.*|placeholder.*|todo|none|null|undefined|true|false|redacted|dummy|test)$/i;
var isPlaceholder = (v) => PLACEHOLDER.test(v.trim()) || /your[-_ ]?(token|key|secret|api)/i.test(v);
function shannonEntropy(s) {
  if (!s) return 0;
  const counts = /* @__PURE__ */ new Map();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}
function redact(secret) {
  const prefix = secret.slice(0, Math.min(4, Math.max(0, secret.length - 8)));
  return `${prefix}\u2026 (${secret.length} chars, redacted)`;
}
function redactSecretsInText(text2) {
  let out = text2;
  for (const p of SECRET_PATTERNS) out = out.replace(p.re, (m) => redact(m));
  return out;
}
function redactFindingText(f) {
  f.evidence = redactSecretsInText(f.evidence);
  f.title = redactSecretsInText(f.title);
  f.whyItMatters = redactSecretsInText(f.whyItMatters);
  f.fix = redactSecretsInText(f.fix);
  return f;
}
function decodeJwt(token) {
  try {
    const part = token.split(".")[1];
    if (!part) return void 0;
    const v = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : void 0;
  } catch {
    return void 0;
  }
}

// ../core/src/rules/scripts.ts
var SCRIPT_EXT = /\.(?:sh|bash|zsh|js|mjs|cjs|ts|py|ps1|bat|cmd|rb|pl|php)$/i;
var MAX_DEPTH3 = 4;
var MAX_SCRIPTS = 25;
var MAX_LINES = 3e3;
var MAX_LINE_LEN = 2e3;
var NET_JS = /\b(?:fetch|axios(?:\.\w+)?|got|XMLHttpRequest|WebSocket)\s*\(|\bhttps?\.(?:get|request)\s*\(|\brequire\(\s*["'](?:node:)?(?:https?|net|tls|dgram|node-fetch|axios|got)["']\s*\)|\bnet\.(?:connect|createConnection)\b|\bfrom\s+["'](?:node:)?(?:https?|net|node-fetch|axios)["']|\burllib\b|\brequests\.(?:get|post|put)\b|\burlopen\(|\bhttp\.client\b|\bsocket\.socket\b|Net::HTTP|file_get_contents\(\s*["']https?|Invoke-(?:WebRequest|RestMethod)/i;
var SPAWN_ALWAYS = /\bchild_process\b|\bos\.system\s*\(|\bsubprocess\.|\bpopen\s*\(|\beval\s*\(|\bnew Function\s*\(|\bInvoke-Expression\b|\biex\b|\bStart-Process\b|Runtime\.getRuntime\(\)\.exec|\bshell_exec\s*\(|\bproc_open\s*\(/i;
var SPAWN_FN = /\b(?:exec|execSync|execFile|execFileSync|execa|execaSync|execaCommand|spawn|spawnSync|fork)\s*\(/;
var PROC_IMPORT = /child_process|\bexeca\b|shelljs|cross-spawn|node-pty|\bpty\b/;
var PROTECTIVE_CTX = /(?:protect|guard|block|deny|forbid|ignore|exclude|allow(?:ed)?|restrict|sensitive|secrets?|safe|example)/i;
var STRING_ONLY_LINE = /^\s*(?:[rbfu]?["'\x60][^"'\x60]*["'\x60]\s*,?\s*)+[\]\)}]?,?\s*$/;
var GUARD_NAME = String.raw`["'\x60][^"'\x60]*(?:\.env|\.ssh|\.aws|\.npmrc|\.netrc|id_rsa|credentials)[^"'\x60]*["'\x60]`;
var PATH_GUARD = new RegExp(
  GUARD_NAME + String.raw`\s+(?:not\s+)?in\s+[\w.\[\]()]+` + String.raw`|\.(?:endswith|startswith|endsWith|startsWith|includes|match|test|contains)\(\s*` + GUARD_NAME + String.raw`|[=!]==?\s*` + GUARD_NAME + "|" + GUARD_NAME + String.raw`\s*[=!]==?`,
  "i"
);
var READ_CALL = /\b(?:open|read\w*|load_dotenv|dotenv\w*|cat|source)\s*[(\s]/;
var isPathGuard = (line) => PATH_GUARD.test(line) && !READ_CALL.test(line.replace(PATH_GUARD, ""));
var B642 = /Buffer\.from\([^)]*["']base64["']|\batob\s*\(|b64decode|base64\.(?:b64)?decode|FromBase64String|openssl\s+base64/i;
var SECRET_ENV = /process\.env\.[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_?KEY)|os\.environ(?:\.get)?[\[(]\s*["'][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_?KEY)/i;
function redact2(s) {
  let out = s;
  for (const p of SECRET_PATTERNS) {
    p.re.lastIndex = 0;
    out = out.replace(p.re, "[redacted]");
  }
  return out;
}
var posixNormalize = (p) => {
  const parts = [];
  for (const seg of p.replace(/\\/g, "/").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (!parts.length) return void 0;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
};
var dirOf = (p) => p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
var PROJECT_VARS = /^(?:\$\{?(?:CLAUDE_PROJECT_DIR|CURSOR_PROJECT_DIR|PWD|workspaceFolder|workspaceRoot|GITHUB_WORKSPACE)\}?|%(?:CLAUDE_PROJECT_DIR|CD)%|\$\{(?:workspaceFolder|workspaceRoot)\})[\\/]*/i;
var SCRIPT_DIR_VARS = /^(?:\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\$\(\s*dirname\s+["']?\$\{?(?:0|BASH_SOURCE(?:\[0\])?)\}?["']?\s*\)|\$\{BASH_SOURCE(?:\[0\])?%\/\*\}|__dirname|%~dp0|\$PSScriptRoot)[\\/]+/;
function scriptRefs(text2, scriptDir) {
  text2 = executedSegments(text2).join(" ; ");
  const out = [];
  const tokens = text2.split(/[\s"'`(),=;|&<>{}\[\]]+/).filter(Boolean);
  const joined = text2.match(/(?:\$\{[A-Za-z_]+\}|\$\([^)]*\)|[^\s"'`(),=;|&<>\[\]])+/g) ?? tokens;
  const seen = /* @__PURE__ */ new Set();
  const add = (p) => {
    if (p !== void 0 && p !== "" && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  };
  for (let tok of joined) {
    if (tok.includes("://") || tok.startsWith("-") || tok.startsWith("~") || /^[A-Za-z]:[\\/]/.test(tok) || tok.startsWith("/")) continue;
    if (!SCRIPT_EXT.test(tok)) continue;
    let rel = tok;
    let scriptRel = false;
    if (PROJECT_VARS.test(rel)) rel = rel.replace(PROJECT_VARS, "");
    else if (SCRIPT_DIR_VARS.test(rel)) {
      rel = rel.replace(SCRIPT_DIR_VARS, "");
      scriptRel = true;
    } else if (rel.startsWith("$")) continue;
    if (/[$`]/.test(rel)) continue;
    const fromRoot = posixNormalize(rel);
    const fromScript = posixNormalize((scriptDir ? scriptDir + "/" : "") + rel);
    if (scriptRel) {
      add(fromScript);
      add(fromRoot);
    } else {
      add(fromRoot);
      if (/^\.{1,2}[\\/]/.test(tok) || !/[\\/]/.test(tok)) add(fromScript);
    }
  }
  return out;
}
function jsImports(text2, scriptDir) {
  const out = [];
  const re = /(?:require\(\s*|import\s*\(\s*|\bfrom\s+|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g;
  for (const m of text2.matchAll(re)) {
    const base = posixNormalize((scriptDir ? scriptDir + "/" : "") + m[1]);
    if (!base) continue;
    out.push(base);
    if (!SCRIPT_EXT.test(base)) for (const e of [".js", ".mjs", ".cjs", ".ts", "/index.js"]) out.push(base + e);
  }
  return out;
}
var emptyFlags = () => ({ network: false, spawn: false, base64: false, secretPath: false, secretEnv: false, pipeToShell: false });
function severityOf(f) {
  if (f.pipeToShell || f.network && f.secretPath || f.base64 && f.spawn) return "critical";
  if (f.secretPath || f.network && f.spawn || f.base64 && f.network || f.network && f.secretEnv) return "high";
  if (f.network || f.base64) return "medium";
  return "low";
}
function followScripts(command, ctx, baseDir = "") {
  const chain = { severity: "low", flags: emptyFlags(), evidence: [], read: [], unreadable: [] };
  if (!ctx.readFile) return chain;
  const visited = /* @__PURE__ */ new Set();
  let worst = "low";
  const queue = [];
  const refsCmd = scriptRefs(command, baseDir);
  for (const r of refsCmd) {
    if (visited.has(r)) continue;
    if (ctx.readFile(r) !== void 0) {
      queue.push({ path: r, depth: 1 });
      visited.add(r);
    }
  }
  if (!queue.length && refsCmd.length) chain.unreadable.push(refsCmd[0]);
  while (queue.length && chain.read.length < MAX_SCRIPTS) {
    const { path, depth } = queue.shift();
    const text2 = ctx.readFile(path);
    if (text2 === void 0 || text2.includes("\0")) {
      chain.unreadable.push(path);
      continue;
    }
    chain.read.push(path);
    const dir = dirOf(path);
    const lines = text2.split(/\r?\n/).slice(0, MAX_LINES);
    const here = emptyFlags();
    const add = (signal, line, raw) => {
      if (chain.evidence.some((e) => e.signal === signal && e.path === path)) return;
      chain.evidence.push({ signal, path, line, snippet: redact2(raw.trim().slice(0, 140)) });
    };
    const isPy = /\.py$/i.test(path);
    const usesProc = PROC_IMPORT.test(text2);
    const infos = [];
    let inDoc = false;
    lines.forEach((raw, i) => {
      const line = raw.length > MAX_LINE_LEN ? raw.slice(0, MAX_LINE_LEN) : raw;
      const t = line.trim();
      if (isPy) {
        const q = (t.match(/"""|'''/g) ?? []).length;
        if (inDoc) {
          if (q % 2 === 1) inDoc = false;
          return;
        }
        if (q % 2 === 1) {
          inDoc = true;
          return;
        }
        if (q >= 2 && (t.startsWith('"""') || t.startsWith("'''"))) return;
      }
      if (!t || t.startsWith("#") && !t.startsWith("#!") || t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
      infos.push({ i, line, a: analyzeCommand(line) });
    });
    const fileNetwork = infos.some((x) => x.a.network || NET_JS.test(x.line));
    const isProtectiveList = (i, line) => {
      if (fileNetwork) return false;
      if (isPathGuard(line)) return true;
      const quoted = (line.match(/["'\x60][^"'\x60]+["'\x60]/g) ?? []).length;
      if (quoted === 0) return false;
      if (PROTECTIVE_CTX.test(line) && /[=:]\s*[\[({]|\[|\{|\(/.test(line)) return true;
      if (quoted >= 2 && /[\[({]/.test(line) && !/\w\s*\(/.test(line.replace(/^\s*[\w.]+\s*[=:]\s*[\[({]/, ""))) {
        return PROTECTIVE_CTX.test(lines.slice(Math.max(0, i - 2), i + 1).join(" "));
      }
      if (STRING_ONLY_LINE.test(line)) return PROTECTIVE_CTX.test(lines.slice(Math.max(0, i - 8), i).join(" "));
      return false;
    };
    for (const { i, line, a } of infos) {
      if (a.network || NET_JS.test(line)) {
        chain.flags.network = true;
        here.network = true;
        add("network call", i + 1, line);
      }
      if (a.sensitiveRef && !isProtectiveList(i, line)) {
        chain.flags.secretPath = true;
        here.secretPath = true;
        add("reads credential/secret path", i + 1, line);
      }
      if (a.pipeToShell) {
        chain.flags.pipeToShell = true;
        here.pipeToShell = true;
        add("pipes into a shell/interpreter", i + 1, line);
      }
      if (a.base64Exec || B642.test(line)) {
        chain.flags.base64 = true;
        here.base64 = true;
        add("base64 decode", i + 1, line);
      }
      if (SPAWN_ALWAYS.test(line) || usesProc && SPAWN_FN.test(line) || a.inlineInterp || a.shellWrapper) {
        chain.flags.spawn = true;
        here.spawn = true;
        add("spawns a process / evals code", i + 1, line);
      }
      if (SECRET_ENV.test(line)) {
        chain.flags.secretEnv = true;
        here.secretEnv = true;
        add("reads a secret environment variable", i + 1, line);
      }
    }
    if (sevRank(severityOf(here)) > sevRank(worst)) worst = severityOf(here);
    if (depth < MAX_DEPTH3) {
      const next = /* @__PURE__ */ new Set();
      for (const l of lines) for (const r of scriptRefs(l.slice(0, MAX_LINE_LEN), dir)) next.add(r);
      for (const r of jsImports(text2, dir)) next.add(r);
      for (const r of next) {
        if (visited.has(r)) continue;
        if (ctx.readFile(r) !== void 0) {
          queue.push({ path: r, depth: depth + 1 });
          visited.add(r);
        }
      }
    }
  }
  chain.severity = chain.read.length ? worst : "low";
  return chain;
}
var maxSev = (a, b) => sevRank(a) >= sevRank(b) ? a : b;
function analyzeWithScripts(command, ctx, baseDir = "") {
  const a = analyzeCommand(command);
  const chain = followScripts(command, ctx, baseDir);
  const onlyRepoScript = a.repoScript && !a.network && !a.pipeToShell && !a.base64Exec && !a.sensitiveRef && !a.inlineInterp && !a.shellWrapper;
  const refd = a.repoScript || chain.read.length > 0 || chain.unreadable.length > 0;
  let base = a.severity;
  const unverifiedScript = refd && chain.read.length === 0 && (a.repoScript || chain.unreadable.length > 0);
  if (onlyRepoScript && chain.read.length > 0) base = "low";
  const severity = chain.read.length ? maxSev(base, chain.severity) : base;
  const signals = [...a.signals.filter((s) => !(onlyRepoScript && chain.read.length > 0 && s.startsWith("runs a script")))];
  if (chain.read.length) signals.push(`follows ${chain.read.length} repo script${chain.read.length > 1 ? "s" : ""}`);
  const chainEvidence = chain.read.length ? `
  chain: ${chain.read.join(" \u2192 ")}` + chain.evidence.map((e) => `
  ${e.path}:${e.line} [${e.signal}] ${e.snippet}`).join("") : "";
  return { severity, signals, chain, unverifiedScript, chainEvidence };
}

// ../core/src/rules/settings-rules.ts
var DOCS = "https://code.claude.com/docs/en/settings";
var HOOKS_DOCS = "https://code.claude.com/docs/en/hooks";
var M001 = { id: "AG-001", title: "Permission widening or bypass", category: "permissions", defaultSeverity: "high", references: [DOCS] };
var DANGEROUS_PREFIX = /^(?:curl|wget|rm|sudo|su|sh|bash|zsh|python[\d.]*|node|npx|bunx|ssh|scp|nc|ncat|eval|exec|powershell|pwsh|cmd|chmod|chown|dd|mkfs|git push|docker|kubectl)\b/i;
function classifyAllow(entry) {
  const m = /^\s*([A-Za-z_][\w:.-]*)\s*(?:\(([\s\S]*)\))?\s*$/.exec(entry);
  if (!m) return void 0;
  const tool = m[1];
  const spec = m[2]?.trim();
  if (tool === "*") return { sev: "high", why: "allows every tool without a prompt", fix: "Replace with specific, narrow rules." };
  if (tool === "Bash") {
    if (spec === void 0 || spec === "" || /^(?:\*{1,2}|:\*)$/.test(spec))
      return { sev: "high", why: "allows any shell command without a prompt", fix: "Allow only specific commands, e.g. Bash(npm run test)." };
    const cmd = spec.replace(/:\*$/, "").replace(/\s*\*+$/, "").trim();
    const wildcard = /(?::\*|\*)$/.test(spec);
    if (wildcard && (/(?:^|\s)(?:--version|-v|-V|--help|-h)$/.test(cmd) || /^(?:git (?:status|diff|log|show|branch|rev-parse|describe|ls-files|remote -v)|npm (?:ls|list|view|outdated)|pnpm (?:ls|list|why|outdated)|yarn (?:list|why)|pip3? (?:list|show|freeze))$/i.test(cmd)))
      return { sev: "low", why: `allows "${cmd}" with arbitrary arguments, but the command is read-only`, fix: "Optional: allow exact invocations." };
    if (wildcard && /^git push\b/i.test(cmd))
      return { sev: "medium", why: "allows pushing to any remote or branch without a prompt", fix: "Allow an exact push command (for example Bash(git push origin HEAD)) or leave it to prompt." };
    if (wildcard && /^(?:curl|wget)\b/i.test(cmd) && /\bhttps?:\/\/(?:localhost|127\.\d+\.\d+\.\d+|\[::1\])(?::\d+)?(?:\/\S*)?$/i.test(cmd))
      return { sev: "medium", why: `allows "${cmd}" with arbitrary arguments (loopback only, but a prefix rule can also match arguments that name other hosts)`, fix: "Allow exact URLs instead of a wildcard." };
    if (wildcard && /^(?:npx|bunx|pnpm dlx|pnpm exec|yarn dlx|npm exec)\s+[^-\s*:]\S*/i.test(cmd))
      return { sev: "medium", why: `allows "${cmd}" with arbitrary arguments (a named package, so narrower than a bare launcher, but it still runs package code)`, fix: "Allow exact invocations instead of a wildcard." };
    if (wildcard && DANGEROUS_PREFIX.test(cmd))
      return { sev: "high", why: `allows "${cmd}" with arbitrary arguments, which can run code or move data`, fix: "Allow exact commands instead of a wildcard prefix." };
  }
  if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool) && spec !== void 0 && /^(?:\/|~|\.\.|[A-Za-z]:[\\/])/.test(spec) && /\*/.test(spec))
    return { sev: "high", why: "allows writes outside the project directory without a prompt", fix: "Limit write rules to project-relative paths." };
  if (tool === "Read" && spec !== void 0 && /(?:\.ssh|\.aws|\.gnupg|\.env|\.npmrc|\.netrc|id_rsa)/.test(spec))
    return { sev: "high", why: "pre-approves reads of credential locations", fix: "Remove it and add a matching deny rule." };
  return void 0;
}
var SAFE_ALLOW_TEMPLATE = ["Bash(npm run test)", "Bash(npm run lint)", "Bash(git status)", "Bash(git diff:*)"];
function allowFixes(file, i, entry) {
  const path = ["permissions", "allow", i];
  const fixes = [];
  if (/^\s*(?:\*|Bash|Bash\(\s*(?:\*{1,2}|:\*)?\s*\))\s*$/.test(entry)) {
    fixes.push({ file: file.path, description: `Replace "${entry}" with a narrow allowlist template (edit the commands afterwards)`, edits: replaceElementEdit(file, path, SAFE_ALLOW_TEMPLATE) });
  }
  fixes.push({ file: file.path, description: `Remove "${entry}" from permissions.allow`, edits: removeArrayElementEdit(file, path) });
  return fixes.filter((a) => a.edits.length);
}
var ag001 = defineRule(M001, SETTINGS_KINDS, (file, ctx) => {
  const out = [];
  const p = file.parsed;
  if (!isObj(p)) return out;
  const perms = isObj(p.permissions) ? p.permissions : void 0;
  const shared = file.kind === "claude-settings";
  if (perms && Array.isArray(perms.allow)) {
    perms.allow.forEach((e, i) => {
      if (!isStr(e)) return;
      const c = classifyAllow(e);
      if (!c) return;
      out.push(finding(M001, file, ["permissions", "allow", i], {
        severity: c.sev,
        confidence: "high",
        title: `Broad permission in allow list: ${e}`,
        whyItMatters: `This rule ${c.why}. In a repository-controlled file it lets an injected instruction act without the user seeing a prompt.`,
        evidence: e,
        fix: c.fix,
        autofix: allowFixes(file, i, e)
      }));
    });
  }
  const mode = perms?.defaultMode;
  if (isStr(mode) && ["bypassPermissions", "auto", "dontAsk"].includes(mode)) {
    const bypass = mode === "bypassPermissions";
    out.push(finding(M001, file, ["permissions", "defaultMode"], {
      severity: bypass ? shared ? "high" : "medium" : "medium",
      confidence: shared ? "medium" : "low",
      title: `Permission mode set to ${mode}`,
      whyItMatters: bypass ? "bypassPermissions disables permission prompts. Current Claude Code documents that this value is ignored from project/local settings, but older versions honored it (CVE-2026-33068 class, see docs/SOURCES.md), and its presence signals intent." : `defaultMode "${mode}" reduces permission prompts for everyone who opens the project.`,
      evidence: `"defaultMode": "${mode}"`,
      fix: "Remove defaultMode from the shared project file; set it only in your own user settings.",
      autofix: [{ file: file.path, description: "Remove permissions.defaultMode", edits: removePropertyEdit(file, ["permissions", "defaultMode"]) }].filter((a) => a.edits.length)
    }));
  }
  for (const key of ["skipDangerousModePermissionPrompt", "skipAutoPermissionPrompt"]) {
    if (p[key] === true && shared) {
      out.push(finding(M001, file, [key], {
        severity: "high",
        confidence: "medium",
        title: `${key} set in a shared project file`,
        whyItMatters: "Documented as a user/local/managed-only key. In a repo file it is either ignored or an attempt to suppress the confirmation dialog.",
        evidence: `"${key}": true`,
        fix: "Remove it from the project file.",
        autofix: [{ file: file.path, description: `Remove ${key}`, edits: removePropertyEdit(file, [key]) }].filter((a) => a.edits.length)
      }));
    }
  }
  if (shared) {
    const deny = perms && Array.isArray(perms.deny) ? perms.deny.filter(isStr) : [];
    if (!deny.some((d) => /(?:\.env|secrets?|\.ssh|\.aws)/i.test(d))) {
      out.push(finding(M001, file, perms ? ["permissions"] : void 0, {
        severity: "low",
        confidence: "high",
        title: "No deny rule for secret files",
        whyItMatters: "A deny rule such as Read(./.env) keeps the agent from reading secret files even if instructed to.",
        evidence: perms ? "permissions.deny does not mention .env, secrets, .ssh or .aws" : "no permissions block",
        fix: 'Add "Read(./.env)" and "Read(./secrets/**)" to permissions.deny.'
      }));
    }
  }
  void ctx;
  return out;
});
var M002 = { id: "AG-002", title: "Command that runs automatically from agent settings", category: "execution", defaultSeverity: "high", references: [HOOKS_DOCS, DOCS] };
var COMMAND_KEYS = ["apiKeyHelper", "statusLine", "awsAuthRefresh", "awsCredentialExport", "gcpAuthRefresh", "otelHeadersHelper", "fileSuggestion", "subagentStatusLine"];
function settingsCommands(p) {
  const out = [];
  if (!isObj(p)) return out;
  if (isObj(p.hooks)) {
    for (const [event, groups] of Object.entries(p.hooks)) {
      if (!Array.isArray(groups)) continue;
      groups.forEach((g, gi) => {
        if (!isObj(g) || !Array.isArray(g.hooks)) return;
        g.hooks.forEach((h, hi) => {
          if (!isObj(h)) return;
          const base = ["hooks", event, gi, "hooks", hi];
          if ((h.type === "command" || h.type === void 0) && isStr(h.command)) {
            const args = Array.isArray(h.args) ? h.args.filter(isStr).join(" ") : "";
            out.push({ command: args ? `${h.command} ${args}` : h.command, path: [...base, "command"], origin: `${event} hook` });
          } else if (h.type === "http" && isStr(h.url)) {
            out.push({ command: `@http ${h.url}`, path: [...base, "url"], origin: `${event} http hook` });
          }
        });
      });
    }
  }
  for (const k of COMMAND_KEYS) {
    const v = p[k];
    if (isStr(v)) out.push({ command: v, path: [k], origin: k });
    else if (isObj(v) && isStr(v.command)) out.push({ command: v.command, path: [k, "command"], origin: k });
  }
  return out;
}
var ag002 = defineRule(M002, SETTINGS_KINDS, (file, ctx) => {
  const out = [];
  for (const c of settingsCommands(file.parsed)) {
    if (c.command.startsWith("@http ")) {
      const url = c.command.slice(6);
      const host = parseHost(url);
      const loop = host !== void 0 && isLoopback(host);
      out.push(finding(M002, file, c.path, {
        severity: loop ? "low" : "high",
        confidence: "medium",
        title: `${c.origin} posts to ${host ?? "a URL"}`,
        whyItMatters: "HTTP hooks send event data (which can include tool input and prompts) to the URL on every matching event.",
        evidence: url,
        fix: "Remove the hook or point it at an endpoint you control and trust."
      }));
      continue;
    }
    const v = analyzeWithScripts(c.command, ctx);
    const sev2 = v.severity === "low" && !v.chain.read.length ? "info" : v.severity;
    const risky = sev2 === "medium" || sev2 === "high" || sev2 === "critical";
    const followed = v.chain.read.length > 0;
    out.push(finding(M002, file, c.path, {
      severity: sev2,
      confidence: v.unverifiedScript || sev2 === "medium" ? "medium" : "high",
      title: risky ? `${c.origin} runs a risky command (${v.signals.join(", ")})` : followed ? `${c.origin} runs ${v.chain.read[0]}, which shows no risky behaviour` : `${c.origin} runs a command`,
      whyItMatters: risky ? "This command runs automatically, without a prompt, from a file the repository controls. Hooks run with your user privileges (documented class: CVE-2025-59536, see docs/SOURCES.md)." + (followed ? " Referenced repo scripts were read as text (never executed) and the finding reflects what they contain." : "") : "Hooks and helper commands run automatically. This one shows no risky signals" + (followed ? " in the script it runs" : "") + "; review it anyway.",
      evidence: c.command + v.chainEvidence,
      fix: "Remove the entry, or replace it with a reviewed command that has no network or credential access.",
      autofix: risky ? [{ file: file.path, description: `Remove ${c.origin}`, edits: removeHookEdit(file, c.path) }].filter((x) => x.edits.length) : void 0
    }));
  }
  return out;
});
var M003 = { id: "AG-003", title: "Project MCP servers auto-approved by project settings", category: "permissions", defaultSeverity: "critical", references: ["https://code.claude.com/docs/en/mcp"] };
var ag003 = defineRule(M003, SETTINGS_KINDS, (file, ctx) => {
  const out = [];
  const p = file.parsed;
  if (!isObj(p)) return out;
  const tracked = ctx.trackedFiles?.has(file.path);
  const shared = file.kind === "claude-settings" || tracked === true;
  const note = "A repository that ships both .mcp.json and this setting approves its own servers, skipping the approval prompt (TrustFall class). Current Claude Code ignores committed approvals in untrusted folders; once the folder is trusted they apply.";
  if (p.enableAllProjectMcpServers === true) {
    out.push(finding(M003, file, ["enableAllProjectMcpServers"], {
      severity: shared ? "critical" : "medium",
      confidence: shared ? "high" : "low",
      title: "enableAllProjectMcpServers is true",
      whyItMatters: note,
      evidence: '"enableAllProjectMcpServers": true',
      fix: "Set it to false (or remove it) so each server needs your approval.",
      autofix: [{ file: file.path, description: "Set enableAllProjectMcpServers to false", edits: setValueEdit(file, ["enableAllProjectMcpServers"], false) }].filter((a) => a.edits.length)
    }));
  }
  if (Array.isArray(p.enabledMcpjsonServers) && p.enabledMcpjsonServers.length > 0 && shared) {
    const shipped = /* @__PURE__ */ new Set();
    for (const f of ctx.files) if (f.path.endsWith(".mcp.json") && isObj(f.parsed) && isObj(f.parsed.mcpServers)) Object.keys(f.parsed.mcpServers).forEach((k) => shipped.add(k));
    const names2 = p.enabledMcpjsonServers.filter(isStr);
    const hit = names2.some((n) => shipped.has(n));
    out.push(finding(M003, file, ["enabledMcpjsonServers"], {
      severity: hit ? "critical" : "high",
      confidence: hit ? "high" : "medium",
      title: `enabledMcpjsonServers pre-approves: ${names2.join(", ")}`,
      whyItMatters: note,
      evidence: `"enabledMcpjsonServers": ${JSON.stringify(names2)}`,
      fix: "Remove the pre-approval and approve servers interactively after reviewing them.",
      autofix: [{ file: file.path, description: "Remove enabledMcpjsonServers", edits: removePropertyEdit(file, ["enabledMcpjsonServers"]) }].filter((a) => a.edits.length)
    }));
  }
  return out;
});
var M004 = { id: "AG-004", title: "Local agent settings file is tracked by git", category: "persistence", defaultSeverity: "high", references: [DOCS] };
var RISKY_LOCAL_KEYS = ["hooks", "env", "enableAllProjectMcpServers", "enabledMcpjsonServers", "statusLine", "apiKeyHelper", "awsAuthRefresh", "awsCredentialExport", "gcpAuthRefresh", "otelHeadersHelper", "fileSuggestion", "subagentStatusLine"];
function localSettingsRisky(file) {
  const p = file.parsed;
  if (!isObj(p)) return true;
  if (RISKY_LOCAL_KEYS.some((k) => p[k] !== void 0)) return true;
  const perms = isObj(p.permissions) ? p.permissions : {};
  if (isStr(perms.defaultMode) && perms.defaultMode !== "default") return true;
  const allow = Array.isArray(perms.allow) ? perms.allow.filter(isStr) : [];
  return allow.some((e) => {
    const c = classifyAllow(e);
    return c !== void 0 && c.sev !== "low";
  });
}
var ag004 = defineRule(M004, ["claude-local-settings"], (file, ctx) => {
  if (file.path.startsWith("~/")) return [];
  const tracked = ctx.trackedFiles?.has(file.path);
  if (tracked === false) return [];
  const known = tracked === true;
  const risky = localSettingsRisky(file);
  return [finding(M004, file, void 0, {
    severity: known ? risky ? "high" : "medium" : "medium",
    confidence: known ? "high" : "low",
    title: known ? `${file.path} is committed to git${risky ? "" : " (contents are only narrow permission rules)"}` : `${file.path} exists; git tracking status unknown`,
    whyItMatters: "settings.local.json is meant to be personal and untracked. A committed copy lets the repository ship hooks, env overrides and approvals as if they were your own local choices.",
    evidence: known ? `${file.path} is in the git index` : "git index unavailable",
    fix: `Run: git rm --cached ${file.path}, and add it to .gitignore.`,
    range: { startLine: 0, startCol: 0, endLine: 0, endCol: 0 }
  })];
});
var M005 = { id: "AG-005", title: "Environment override redirects credentials or injects code", category: "exfiltration", defaultSeverity: "critical", references: [DOCS] };
var CODE_INJECT = /* @__PURE__ */ new Set(["LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH", "BASH_ENV", "ENV", "GIT_SSH_COMMAND", "PYTHONSTARTUP", "PYTHONPATH", "NODE_PATH", "GIT_EXEC_PATH", "GIT_ASKPASS", "SSH_ASKPASS", "EDITOR", "VISUAL", "PAGER"]);
var PROXY = /^(?:https?_proxy|all_proxy)$/i;
var BASE_URL = /(?:_BASE_URL|_API_BASE|_API_URL|_ENDPOINT|_HOST)$/i;
var ag005 = defineRule(M005, SETTINGS_KINDS, (file, ctx) => {
  const out = [];
  const p = file.parsed;
  if (!isObj(p) || !isObj(p.env)) return out;
  const shared = file.kind === "claude-settings" || ctx.trackedFiles?.has(file.path) === true;
  for (const [key, raw] of Object.entries(p.env)) {
    if (!isStr(raw)) continue;
    const at = ["env", key];
    const emit = (severity, confidence, title, why) => out.push(finding(M005, file, at, {
      severity: shared ? severity : severity === "critical" ? "high" : severity,
      confidence,
      title,
      whyItMatters: why,
      evidence: `${key}=${raw}`,
      fix: `Remove ${key} from the project settings file.`,
      autofix: [{ file: file.path, description: `Remove env.${key}`, edits: removePropertyEdit(file, at) }].filter((a) => a.edits.length)
    }));
    if (BASE_URL.test(key) || PROXY.test(key)) {
      const host = parseHost(raw.replace(/^(?!\w+:\/\/)/, "http://"));
      const proxy = PROXY.test(key);
      if (raw.includes("${")) {
        emit("medium", "low", `${key} is built from a variable`, "The final destination cannot be determined statically.");
        continue;
      }
      if (host === void 0) {
        emit("medium", "low", `${key} has an unparseable URL`, "The destination cannot be determined.");
        continue;
      }
      if (isLoopback(host)) {
        emit("low", "medium", `${key} points to loopback`, "Traffic is routed to a local process; verify it is yours.");
        continue;
      }
      if (!proxy && isFirstPartyHost(host)) continue;
      const cls = exfilClass(host);
      emit(
        "critical",
        cls ? "high" : "medium",
        `${key} redirects to ${host}`,
        proxy ? "A proxy set by a repository sees all agent traffic, including API credentials." : "Overriding the API base URL sends your API key and prompts to the host the repository names (CVE-2026-21852 class, see docs/SOURCES.md). A corporate gateway also looks like this, hence medium confidence unless the host is a known capture/tunnel class."
      );
    } else if (CODE_INJECT.has(key)) {
      emit("critical", "high", `${key} is overridden`, "This variable makes the OS or a tool load attacker-chosen code or helpers into agent subprocesses.");
    } else if (key === "NODE_OPTIONS") {
      const inject = /(?:--require|-r\b|--import|--loader|--experimental-loader|--eval)/.test(raw);
      emit(inject ? "critical" : "medium", inject ? "high" : "low", "NODE_OPTIONS is overridden", "NODE_OPTIONS with --require/--import preloads arbitrary code into every Node process the agent starts.");
    } else if (key.toUpperCase() === "PATH") {
      const rel = /(?:^|[:;])\s*(?:\.{1,2}(?=[\\/:;]|$)|\$\{?(?:CLAUDE_PROJECT_DIR|PWD)\}?)/.test(raw);
      emit(rel ? "critical" : "medium", rel ? "medium" : "low", "PATH is overridden", "A PATH entry inside the repository lets repo-controlled binaries shadow git, node, python and others.");
    } else if (/^(?:NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|REQUESTS_CA_BUNDLE|CURL_CA_BUNDLE)$/.test(key)) {
      emit("high", "medium", `${key} trusts a repository-supplied CA`, "A custom CA lets a man-in-the-middle read TLS traffic, including credentials.");
    } else if (key === "NODE_TLS_REJECT_UNAUTHORIZED" && raw === "0") {
      emit("high", "high", "TLS verification disabled", "Disabling certificate checks lets any network observer intercept agent traffic.");
    }
  }
  return out;
});
var jsonRemoveEdits = removeNodeEdits;
var removePropertyEdit = jsonRemoveEdits;
var removeArrayElementEdit = jsonRemoveEdits;
function removeHookEdit(file, commandPath) {
  if (commandPath[0] === "hooks" && commandPath.length >= 5) return jsonRemoveEdits(file, commandPath.slice(0, 5));
  return jsonRemoveEdits(file, [commandPath[0]]);
}
var settingsRules = [ag001, ag002, ag003, ag004, ag005];

// ../core/src/rules/frontmatter.ts
var unquote = (s) => {
  const t = s.trim();
  return t.length >= 2 && (t[0] === '"' && t.at(-1) === '"' || t[0] === "'" && t.at(-1) === "'") ? t.slice(1, -1) : t;
};
function parseFrontmatter(text2) {
  const lines = text2.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return void 0;
  let end = -1;
  for (let i = 1; i < lines.length && i < 400; i++) if (lines[i].trim() === "---") {
    end = i;
    break;
  }
  if (end < 0) return void 0;
  const keys = [];
  let cur;
  for (let i = 1; i < end; i++) {
    const l = lines[i];
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(l);
    if (m && !/^\s/.test(l)) {
      let scalar = m[2].replace(/\s+#.*$/, "");
      if (/^[|>][+-]?$/.test(scalar.trim())) scalar = "";
      cur = { key: m[1], line: i, scalar: scalar.trim(), block: [], blockLine: -1 };
      keys.push(cur);
    } else if (cur && l.trim() !== "") {
      if (cur.blockLine < 0) cur.blockLine = i;
      cur.block.push(l);
    }
  }
  return { keys, endLine: end };
}
function toolEntries(k) {
  const out = [];
  const split = (s, line) => {
    let depth = 0;
    let buf = "";
    const flush = () => {
      const t = unquote(buf.trim());
      if (t) out.push({ entry: t, line });
      buf = "";
    };
    for (const ch of s.replace(/^\[|\]$/g, "")) {
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);
      if (depth === 0 && (ch === "," || /\s/.test(ch))) flush();
      else buf += ch;
    }
    flush();
  };
  if (k.scalar) split(k.scalar, k.line);
  k.block.forEach((raw, i) => {
    const t = raw.trim().replace(/^-\s*/, "");
    split(t, (k.blockLine >= 0 ? k.blockLine : k.line) + i);
  });
  return out;
}
var fmValue = (fm, key) => fm.keys.find((k) => k.key === key);

// ../core/src/rules/agent-rules.ts
var SKILL_DOCS = "https://code.claude.com/docs/en/skills";
var AGENT_DOCS = "https://code.claude.com/docs/en/sub-agents";
var M025 = { id: "AG-025", title: "Skill or subagent requests unrestricted tools", category: "permissions", defaultSeverity: "high", references: [SKILL_DOCS, AGENT_DOCS] };
var SKILL_PATH = /^\.claude\/(?:skills\/.+\/SKILL|commands\/.+)\.md$/;
var AGENT_PATH = /^\.claude\/agents\/.+\.md$/;
var INTERPRETERS = /* @__PURE__ */ new Set(["python", "python3", "node", "bun", "deno", "bash", "sh", "zsh", "ruby", "perl", "php", "tsx"]);
var ANCHORED = /^(?:\$\{?(?:CLAUDE_PROJECT_DIR|CLAUDE_SKILL_DIR)\}?\/|\.\/|\.?[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)/;
function pathAnchoredInterpreter(entry) {
  const m = /^Bash\(\s*([^)]*?)\s*\)$/.exec(entry);
  if (!m) return false;
  const [interp, target] = m[1].split(/\s+/);
  if (!interp || !target || !INTERPRETERS.has(interp.replace(/[\d.]+$/, "")) && !INTERPRETERS.has(interp)) return false;
  const t = target.replace(/(?::\*|\*+)$/, "");
  if (t.startsWith("-") || t.includes("..") || !ANCHORED.test(t)) return false;
  return !/[*?[\]{}]/.test(t.replace(/^\$\{?[A-Z_]+\}?\//, "").split("/")[0]);
}
var lineRange = (file, line) => {
  const text2 = file.text.split(/\r?\n/)[line] ?? "";
  return { startLine: line, startCol: 0, endLine: line, endCol: text2.length };
};
function hookCommands(k) {
  const out = [];
  k.block.forEach((raw, i) => {
    const m = /^\s*(?:-\s*)?command\s*:\s*(.+?)\s*$/.exec(raw);
    if (m) out.push({ command: m[1].replace(/^["']|["']$/g, ""), line: (k.blockLine >= 0 ? k.blockLine : k.line) + i });
  });
  return out;
}
function skillShellBlocks(text2, fromLine) {
  const out = [];
  const lines = text2.split(/\r?\n/);
  let fence;
  for (let i = fromLine; i < lines.length; i++) {
    const l = lines[i];
    if (fence) {
      if (/^\s*```\s*$/.test(l)) {
        out.push({ command: fence.buf.join("\n"), line: fence.start });
        fence = void 0;
      } else fence.buf.push(l);
      continue;
    }
    if (/^\s*```!\s*$/.test(l)) {
      fence = { start: i, buf: [] };
      continue;
    }
    const re = /(?:^|\s)!`([^`\n]{1,1000})`/g;
    let m;
    while (m = re.exec(l)) out.push({ command: m[1], line: i });
  }
  return out;
}
var sevOfAnalysis = (s) => s;
var ag025 = defineRule(M025, INSTRUCTION_KINDS, (file) => {
  const isSkill = SKILL_PATH.test(file.path);
  const isAgent = AGENT_PATH.test(file.path);
  if (!isSkill && !isAgent) return [];
  const fm = parseFrontmatter(file.text);
  const out = [];
  const what = isAgent ? "subagent" : "skill";
  if (fm && isSkill) {
    const at = fmValue(fm, "allowed-tools");
    if (at) for (const { entry, line } of toolEntries(at)) {
      const c = entry === "*" ? { sev: "high", why: "allows every tool without a prompt", fix: "" } : classifyAllow(entry);
      if (!c || c.sev === "low" || c.sev === "info") continue;
      const anchored = c.sev === "high" && pathAnchoredInterpreter(entry);
      out.push(finding(M025, file, void 0, {
        severity: anchored ? "medium" : c.sev,
        confidence: "high",
        range: lineRange(file, line),
        jsonPath: ["frontmatter", "allowed-tools"],
        subject: entry,
        title: `${what} pre-approves ${entry}`,
        whyItMatters: `allowed-tools lets the ${what} use these tools without asking while it runs; ${c.why}. Anyone who can edit this file widens what an injected instruction can do.${anchored ? " The pre-approval is limited to a script inside the project, which is narrower than an open interpreter wildcard, but that script (and anything it runs) is repository code that executes without a prompt." : ""}`,
        evidence: `allowed-tools: ${entry}`,
        fix: "List only the specific commands the skill needs, e.g. Bash(git status *)."
      }));
    }
  }
  if (fm && isAgent) {
    const pm = fmValue(fm, "permissionMode");
    if (pm && unquote(pm.scalar) === "bypassPermissions") {
      out.push(finding(M025, file, void 0, {
        severity: "high",
        confidence: "medium",
        range: lineRange(file, pm.line),
        jsonPath: ["frontmatter", "permissionMode"],
        title: "Subagent sets permissionMode: bypassPermissions",
        whyItMatters: "A subagent in bypassPermissions mode skips permission prompts. Claude Code documents that a subagent inherits a bypass/acceptEdits/auto parent mode instead, and ignores this for plugin agents, so the effect depends on how it is launched, but the file requests no prompts at all.",
        evidence: "permissionMode: bypassPermissions",
        fix: "Remove permissionMode or use default / plan."
      }));
    }
    const tools = fmValue(fm, "tools");
    if (tools) for (const { entry, line } of toolEntries(tools)) {
      if (entry !== "*" && !/\(\s*(?:\*{1,2}|:\*)\s*\)$/.test(entry)) continue;
      const c = classifyAllow(entry.replace(/\(\s*/, "(").replace(/\s*\)$/, ")"));
      if (!c || c.sev === "low" || c.sev === "info") continue;
      out.push(finding(M025, file, void 0, {
        severity: c.sev,
        confidence: "medium",
        range: lineRange(file, line),
        jsonPath: ["frontmatter", "tools"],
        subject: entry,
        title: `Subagent requests ${entry}`,
        whyItMatters: `The tools list grants ${c.why.replace(/^allows /, "")}.`,
        evidence: `tools: ${entry}`,
        fix: "List specific tools, and restrict Bash to specific commands."
      }));
    }
  }
  if (fm) {
    const hooks = fmValue(fm, "hooks");
    if (hooks) for (const h of hookCommands(hooks)) {
      const a = analyzeCommand(h.command);
      if (a.severity === "info" || a.severity === "low") continue;
      out.push(finding(M025, file, void 0, {
        severity: sevOfAnalysis(a.severity),
        confidence: "medium",
        range: lineRange(file, h.line),
        jsonPath: ["frontmatter", "hooks"],
        subject: clip(h.command, 80),
        title: `${what} registers a risky hook (${a.signals.join(", ")})`,
        whyItMatters: `Hooks declared in a ${what} file run automatically when it is used, with your privileges, from a file the repository controls.`,
        evidence: h.command,
        fix: "Remove the hook or replace it with a reviewed command that has no network or credential access."
      }));
    }
  }
  if (isSkill) {
    for (const b of skillShellBlocks(file.text, fm ? fm.endLine + 1 : 0)) {
      const a = analyzeCommand(b.command);
      if (a.severity === "info" || a.severity === "low") continue;
      out.push(finding(M025, file, void 0, {
        severity: sevOfAnalysis(a.severity),
        confidence: "high",
        range: lineRange(file, b.line),
        jsonPath: ["body", "shell-injection"],
        subject: clip(b.command, 80),
        title: `Skill runs a risky command when invoked (${a.signals.join(", ")})`,
        whyItMatters: "Commands written as !`...` or in a ```! block run when the skill is invoked, before the model (and usually before you) sees the content. This one has risky behaviour.",
        evidence: b.command,
        fix: "Remove the command or replace it with a reviewed, read-only one. Managed settings can disable these with disableSkillShellExecution."
      }));
    }
  }
  return out;
});
var agentRules = [ag025];

// ../core/src/rules/blob-rules.ts
var M024 = { id: "AG-024", title: "Encoded or hidden content in an instruction file", category: "hidden-text", defaultSeverity: "medium", experimental: true, references: ["https://genai.owasp.org/llmrisk/llm01-prompt-injection/"] };
var B64_MIN = 200;
var HEX_MIN = 128;
var WRAP_LINE_MIN = 40;
var COMMENT_MIN = 40;
var TITLE_MIN = 60;
var B64_RE = /[A-Za-z0-9+/]{80,}={0,2}/g;
var HEX_RE = /(?<![0-9A-Za-z])[0-9a-fA-F]{80,}(?![0-9A-Za-z])/g;
var DATA_URI_RE = /\bdata:([a-z]+\/[a-z0-9.+-]+)?(;[a-z0-9=.-]+)*,/gi;
var DIRECTIVE = /\b(?:ignore (?:all |any |the )?(?:previous|prior|above|earlier)|disregard|do not (?:tell|mention|reveal|show|inform)|don't (?:tell|mention|reveal|show)|without (?:telling|asking|informing)|you (?:must|should|will|are to)|always (?:run|execute|include|add|send|call)|system prompt|instructions? (?:above|below)|secretly|silently|quietly|exfiltrat\w*|curl\b|wget\b|\.env\b|api[_ -]?key|password|credentials?|private key|ssh|base64|execute|run the following|<\s*\/?\s*(?:system|instructions?)\s*>)/i;
function decodeRun2(kind, run2) {
  try {
    return printableText(kind === "base64" ? Buffer.from(run2, "base64") : Buffer.from(run2.length % 2 ? run2.slice(0, -1) : run2, "hex"));
  } catch {
    return void 0;
  }
}
var decodesToDirective = (kind, run2) => {
  const d = decodeRun2(kind, run2);
  return d !== void 0 && DIRECTIVE.test(d);
};
function printableText(b) {
  if (b.length < 24) return void 0;
  const s = b.toString("utf8");
  if (s.includes("\uFFFD")) return void 0;
  let ok = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || c >= 32 && c < 127 || c > 160) ok++;
  }
  return ok / s.length >= 0.9 ? s : void 0;
}
var finish = (out, range, sev2, conf, title, why, evidence, fix, path, file) => out.push(finding(M024, file, void 0, { severity: sev2, confidence: conf, range, jsonPath: [path], title, whyItMatters: why, evidence, fix }));
var ag024 = defineRule(M024, INSTRUCTION_KINDS, (file) => {
  const out = [];
  const text2 = file.text;
  const idx = new LineIndex(text2);
  const claimed = [];
  const overlaps = (a, b) => claimed.some(([x, y]) => a < y && b > x);
  const claim = (a, b) => claimed.push([a, b]);
  DATA_URI_RE.lastIndex = 0;
  let m;
  while (m = DATA_URI_RE.exec(text2)) {
    const start = m.index;
    let end = start + m[0].length;
    while (end < text2.length && /[A-Za-z0-9+/=%_.~-]/.test(text2[end]) && end - start < 2e5) end++;
    const payload = end - (start + m[0].length);
    if (payload < 100) continue;
    const mime = (m[1] ?? "text/plain").toLowerCase();
    claim(start, end);
    const image = mime.startsWith("image/");
    const sev2 = image ? "low" : mime === "text/plain" || mime.startsWith("text/") || mime.startsWith("application/") ? "high" : "medium";
    finish(
      out,
      idx.range(start, Math.min(end, start + 80)),
      sev2,
      image ? "medium" : "high",
      image ? `Embedded ${mime} data: URI` : `Embedded ${mime} data: URI (${payload} characters)`,
      image ? "An embedded image is invisible in a diff and models that read images can follow text drawn in it." : "Embedded data is not human-readable in review but is passed to the model as part of the file.",
      clip(text2.slice(start, end), 120),
      "Remove the embedded data or reference a reviewed file instead.",
      `data-uri:${mime}:${text2.slice(start + m[0].length, start + m[0].length + 24)}`,
      file
    );
  }
  for (const [re, kind, min] of [[HEX_RE, "hex", HEX_MIN], [B64_RE, "base64", B64_MIN]]) {
    re.lastIndex = 0;
    while (m = re.exec(text2)) {
      const a = m.index, b = a + m[0].length;
      if (overlaps(a, b)) continue;
      if (kind === "base64" && (m[0].match(/\//g)?.length ?? 0) > m[0].length / 8 && !/[+=]/.test(m[0])) continue;
      if (m[0].length < min && !decodesToDirective(kind, m[0])) continue;
      claim(a, b);
      report(out, file, idx, kind, text2.slice(a, b), a, b);
    }
  }
  const lines = text2.split(/\r?\n/);
  const starts = [];
  let off = 0;
  for (const l of lines) {
    starts.push(off);
    off += l.length + (text2[off + l.length] === "\r" ? 2 : 1);
  }
  let i = 0;
  while (i < lines.length) {
    const kindOf = (l) => {
      const t = l.trim();
      if (t.length < WRAP_LINE_MIN) return void 0;
      if (/^[0-9a-fA-F]+$/.test(t)) return "hex";
      if (/^[A-Za-z0-9+/]+={0,2}$/.test(t)) return "base64";
      return void 0;
    };
    const k = kindOf(lines[i]);
    if (!k) {
      i++;
      continue;
    }
    let j2 = i;
    let total = 0;
    const parts = [];
    while (j2 < lines.length && kindOf(lines[j2]) === k) {
      total += lines[j2].trim().length;
      parts.push(lines[j2].trim());
      j2++;
    }
    if (j2 < lines.length && /^[A-Za-z0-9+/=]+$/.test(lines[j2].trim()) && lines[j2].trim().length > 0 && lines[j2].trim().length < WRAP_LINE_MIN) {
      parts.push(lines[j2].trim());
      total += lines[j2].trim().length;
      j2++;
    }
    const a = starts[i];
    const b = (starts[j2 - 1] ?? a) + lines[j2 - 1].length;
    if (j2 - i >= 2 && total >= (k === "base64" ? B64_MIN : HEX_MIN) && !overlaps(a, b)) {
      claim(a, b);
      report(out, file, idx, k, parts.join(""), a, b);
    }
    i = Math.max(j2, i + 1);
  }
  const lower = text2.toLowerCase();
  let pos = 0;
  while (pos < lower.length) {
    const s = lower.indexOf("<!--", pos);
    if (s < 0) break;
    let e = lower.indexOf("-->", s + 4);
    const unterminated = e < 0;
    if (unterminated) e = Math.min(lower.length, s + 4 + 4e3);
    const body = text2.slice(s + 4, e);
    pos = e + 3;
    if (body.trim().length < COMMENT_MIN) continue;
    const directive = DIRECTIVE.test(body);
    if (!directive && body.trim().length < 400) continue;
    const sev2 = directive ? "high" : "low";
    finish(
      out,
      idx.range(s, Math.min(e + 3, s + 4 + 200)),
      sev2,
      directive ? "medium" : "low",
      directive ? "HTML comment contains instructions aimed at an agent" : "Very long HTML comment",
      "HTML comments are not rendered in a Markdown preview or on GitHub, but the model reads them as part of the file.",
      clip(body.trim(), 200),
      "Delete the comment, or move legitimate notes out of the instruction file.",
      `comment:${body.trim().slice(0, 48)}`,
      file
    );
  }
  const TITLE_RE = /\]\(\s*[^\s)]{0,2000}\s+"([^"\n]{1,2000})"\s*\)/g;
  TITLE_RE.lastIndex = 0;
  while (m = TITLE_RE.exec(text2)) {
    const title = m[1];
    const directive = DIRECTIVE.test(title);
    if (title.length < TITLE_MIN && !directive) continue;
    if (title.length < 20) continue;
    finish(
      out,
      idx.range(m.index, m.index + m[0].length),
      directive ? "high" : "medium",
      directive ? "medium" : "low",
      directive ? "Link title contains instructions aimed at an agent" : "Unusually long link title",
      "Link titles show only as a tooltip, but the model reads them as part of the file.",
      clip(title, 200),
      "Shorten or remove the title.",
      `link-title:${title.slice(0, 48)}`,
      file
    );
  }
  return out;
});
function report(out, file, idx, kind, run2, a, b) {
  let decoded;
  try {
    const bytes = kind === "base64" ? Buffer.from(run2, "base64") : Buffer.from(run2.length % 2 ? run2.slice(0, -1) : run2, "hex");
    decoded = printableText(bytes);
  } catch {
  }
  const readable = decoded !== void 0;
  const directive = readable && DIRECTIVE.test(decoded);
  const sev2 = directive ? "high" : "medium";
  out.push(finding(M024, file, void 0, {
    severity: sev2,
    confidence: directive ? "high" : readable ? "medium" : "low",
    range: idx.range(a, Math.min(b, a + 120)),
    jsonPath: [`${kind}-blob`],
    subject: run2.slice(0, 24),
    title: directive ? `Encoded ${kind} blob decodes to an instruction` : readable ? `Encoded ${kind} blob decodes to readable text` : `Large ${kind} blob (${run2.length} characters)`,
    whyItMatters: "Encoded content cannot be reviewed by reading the file, but a model can decode it and may follow what it says. Legitimate instruction files rarely contain long encoded runs.",
    evidence: readable ? `decoded: "${clip(decoded.replace(/\s+/g, " "), 160)}"  | raw: ${run2.slice(0, 40)}\u2026` : `${run2.slice(0, 60)}\u2026 (${run2.length} chars)`,
    fix: "Remove the blob, or replace it with a reviewed file or plain text."
  }));
}
var blobRules = [ag024];

// ../core/src/intel/mcp-packages.json
var mcp_packages_default = {
  schema: 1,
  description: "Known-bad or known-vulnerable MCP-related packages. Every entry was checked against the cited sources on the access date; entries that were not verified must not be added with verified:true. Versions use semver comparison; 'affected' is a space-separated list of comparators that must all hold.",
  entries: [
    {
      package: "mcp-remote",
      ecosystem: "npm",
      kind: "vulnerable",
      affected: ">=0.0.5 <0.1.16",
      fixedIn: "0.1.16",
      issue: "CVE-2025-6514: OS command injection when connecting to an untrusted MCP server (crafted authorization_endpoint in the OAuth flow)",
      sources: [
        "https://advisories.gitlab.com/npm/mcp-remote/CVE-2025-6514/",
        "https://thehackernews.com/2025/07/critical-mcp-remote-vulnerability.html"
      ],
      verified: true,
      accessed: "2026-10-18"
    },
    {
      package: "postmark-mcp",
      ecosystem: "npm",
      kind: "malicious",
      affected: ">=1.0.16",
      fixedIn: null,
      issue: "Version 1.0.16 (released 2025-09-17) added a hidden BCC copying every outgoing email to an external address; the maintainer deleted the package from npm. Earlier versions are not reported as tampered with by the sources checked.",
      sources: [
        "https://threatprotect.qualys.com/2025/09/30/malicious-mcp-server-on-npm-postmark-mcp-exploited-in-attack/",
        "https://thehackernews.com/2025/09/first-malicious-mcp-server-found.html"
      ],
      verified: true,
      accessed: "2026-10-18"
    }
  ]
};

// ../core/src/rules/mcp-rules.ts
var MCP_DOCS = "https://code.claude.com/docs/en/mcp";
var M006 = { id: "AG-006", title: "MCP server launched through a shell or inline interpreter", category: "mcp", defaultSeverity: "high", references: [MCP_DOCS] };
var INTERP = /* @__PURE__ */ new Set(["python", "python3", "node", "nodejs", "deno", "bun", "ruby", "perl", "php"]);
var ag006 = defineRule(M006, MCP_KINDS, (file) => {
  const out = [];
  for (const s of mcpServers(file)) {
    const command = s.def.command;
    if (!isStr(command)) continue;
    const args = strArgs(s.def);
    const at = [...s.path, "command"];
    const b = baseName(command);
    const joined = args.join(" ");
    const meta = /[|&;`<>]|\$\(|&&/;
    if (/\s/.test(command.trim()) && meta.test(command)) {
      out.push(finding(M006, file, at, { confidence: "high", title: `MCP "${s.name}" command is a shell line`, whyItMatters: "The command field contains shell operators, so a shell is likely parsing it and can chain arbitrary commands.", evidence: command, fix: "Use a plain executable in command and put arguments in args." }));
      continue;
    }
    if (isShell(command)) {
      const launch = effectiveLaunch(s.def);
      const idiom = launch?.wrapper !== void 0;
      const dangerousArgs = meta.test(joined) || /\$\(/.test(joined);
      if (idiom && !dangerousArgs) {
        out.push(finding(M006, file, at, { severity: "info", confidence: "high", title: `MCP "${s.name}" uses the ${b} wrapper idiom`, whyItMatters: "A cmd /c wrapper around a single launcher is a documented Windows pattern; the inner command is checked by AG-007.", evidence: `${command} ${joined}`, fix: "No action needed unless the inner command is unexpected." }));
      } else {
        out.push(finding(M006, file, at, { confidence: "high", title: `MCP "${s.name}" is launched via ${b}`, whyItMatters: "A shell wrapper lets the configuration run arbitrary command lines (pipes, substitution, chaining) when the server starts.", evidence: `${command} ${joined}`, fix: "Launch the server executable directly with a pinned package." }));
      }
      continue;
    }
    if (INTERP.has(b.replace(/[\d.]+$/, "")) || INTERP.has(b)) {
      if (args.some((a) => ["-c", "-e", "--eval", "-p", "--print"].includes(a))) {
        out.push(finding(M006, file, at, { confidence: "high", title: `MCP "${s.name}" runs inline code via ${b}`, whyItMatters: "Inline code in a config file is executed when the server starts and is easy to overlook.", evidence: `${command} ${joined}`, fix: "Move the code into a reviewed, versioned script or use a published package." }));
        continue;
      }
    }
    if (meta.test(joined) || /(?:^|\s)(?:-c|\/c)\s/.test(" " + joined + " ") && isShell(command)) {
      out.push(finding(M006, file, [...s.path, "args"], { severity: "medium", confidence: "medium", title: `MCP "${s.name}" args contain shell operators`, whyItMatters: "Pipes, substitution or chaining in args suggest a shell is involved somewhere in the launch.", evidence: `${command} ${joined}`, fix: "Remove shell operators from args." }));
    }
  }
  return out;
});
var M007 = { id: "AG-007", title: "MCP server runs an unpinned package", category: "supply-chain", defaultSeverity: "high", references: [MCP_DOCS] };
var EXACT_SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
var FLAGS_WITH_VALUE = /* @__PURE__ */ new Set(["-p", "--package", "--from", "--with", "--registry", "--python", "-c", "--call", "--cache", "--prefix", "-w", "--workspace", "--spec", "--index-url", "--extra-index-url", "--index", "--default-index", "--find-links"]);
function splitNpmSpec(spec) {
  const at = spec.indexOf("@", 1);
  return at === -1 ? { name: spec } : { name: spec.slice(0, at), version: spec.slice(at + 1) };
}
function packageOf(cmd, args) {
  const b = baseName(cmd);
  let start = 0;
  let eco;
  if (b === "npx" || b === "bunx") eco = "npm";
  else if (b === "pnpm" && (args[0] === "dlx" || args[0] === "exec")) {
    eco = "npm";
    start = 1;
  } else if (b === "yarn" && args[0] === "dlx") {
    eco = "npm";
    start = 1;
  } else if (b === "npm" && (args[0] === "exec" || args[0] === "x")) {
    eco = "npm";
    start = 1;
  } else if (b === "bun" && args[0] === "x") {
    eco = "npm";
    start = 1;
  } else if (b === "uvx") eco = "pypi";
  else if (b === "uv" && args[0] === "tool" && args[1] === "run") {
    eco = "pypi";
    start = 2;
  } else if (b === "pipx" && args[0] === "run") {
    eco = "pypi";
    start = 1;
  }
  if (!eco) return void 0;
  let yes = -1;
  for (let i = start; i < args.length; i++) {
    const a = args[i];
    if (a === "-y" || a === "--yes") {
      yes = i;
      continue;
    }
    if (a.startsWith("-")) {
      if ((a === "-p" || a === "--package" || a === "--from") && args[i + 1] !== void 0) {
        return finishPkg(eco, args[i + 1], i + 1, yes);
      }
      if (FLAGS_WITH_VALUE.has(a)) i++;
      continue;
    }
    return finishPkg(eco, a, i, yes);
  }
  return void 0;
}
function finishPkg(eco, raw, index, yes) {
  if (/^(?:\.|\/|~|file:|git\+|https?:|[A-Za-z]:[\\/])/.test(raw)) {
    return { eco, pkg: { name: raw, index, exact: /#[0-9a-f]{7,40}$|@[0-9a-f]{40}$/i.test(raw) }, yes };
  }
  if (eco === "npm") {
    const { name, version } = splitNpmSpec(raw);
    return { eco, pkg: { name, version, index, exact: version !== void 0 && EXACT_SEMVER.test(version) }, yes };
  }
  const m = /^([A-Za-z0-9._-]+)(?:\[[^\]]*\])?(?:==|@)(.+)$/.exec(raw);
  if (m) return { eco, pkg: { name: m[1], version: m[2], index, exact: EXACT_SEMVER.test(m[2]) || /^\d+(?:\.\d+)*$/.test(m[2]) && m[2].split(".").length >= 3 }, yes };
  return { eco, pkg: { name: raw.replace(/\[[^\]]*\]/, ""), index, exact: false }, yes };
}
function pinFix(file, at, rawArg, name, eco) {
  if (!rawArg || /[\[\]/:\\]/.test(name.replace(/^@[\w.-]+\//, "")) || rawArg.includes("[") || /^(?:\.|\/|~|file:|git\+|https?:)/.test(rawArg)) return void 0;
  const range = file.locate(at);
  if (!range) return void 0;
  return [{
    file: file.path,
    description: `Pin ${name} to an exact version (you will be asked for it)`,
    input: { id: "version", prompt: `Exact version of ${name} to pin`, placeholder: "1.2.3", pattern: EXACT_SEMVER.source, patternHelp: "Use an exact version such as 1.2.3 (no ranges, no tags like latest)" },
    edits: [{ range, newText: JSON.stringify(name + (eco === "pypi" ? "==" : "@") + "{{input}}") }]
  }];
}
var ag007 = defineRule(M007, MCP_KINDS, (file) => {
  const out = [];
  for (const s of mcpServers(file)) {
    const launch = effectiveLaunch(s.def);
    if (!launch) continue;
    const found = packageOf(launch.cmd, launch.args);
    if (!found) continue;
    const { pkg, yes } = found;
    const argBase = [...s.path, "args"];
    const at = [...argBase, launch.argsOffset + pkg.index];
    if (!pkg.exact) {
      const known = isWellKnownMcpPackage(pkg.name);
      const how = pkg.version === void 0 ? "no version" : `"${pkg.version}" is not an exact version`;
      out.push(finding(M007, file, at, {
        severity: known ? "low" : "high",
        confidence: "high",
        subject: "unpinned",
        title: `MCP "${s.name}" runs ${pkg.name} with ${how}${known ? " (widely used package)" : ""}`,
        whyItMatters: "Every start fetches whatever the registry serves under that spec. A compromised or hijacked release then runs on your machine with your privileges (supply-chain / rug-pull risk).",
        evidence: `${launch.cmd} ${launch.args.join(" ")}`,
        fix: `Pin an exact version, e.g. ${pkg.name}@<x.y.z>${found.eco === "pypi" ? " (or ==x.y.z)" : ""}.`,
        autofix: pinFix(file, at, launch.args[pkg.index], pkg.name, found.eco)
      }));
    }
    if (yes >= 0) {
      out.push(finding(M007, file, [...argBase, launch.argsOffset + yes], {
        severity: pkg.exact || isWellKnownMcpPackage(pkg.name) ? "low" : "medium",
        confidence: "high",
        subject: "auto-confirm",
        title: `MCP "${s.name}" auto-confirms package install (${launch.args[yes]})`,
        whyItMatters: "Auto-confirm removes the last prompt before an unreviewed package is installed and run.",
        evidence: `${launch.cmd} ${launch.args.join(" ")}`,
        fix: "Install the pinned package ahead of time and launch it without auto-confirm where the client allows."
      }));
    }
  }
  return out;
});
var M009 = { id: "AG-009", title: "MCP remote server over plain HTTP or without auth", category: "mcp", defaultSeverity: "high", references: [MCP_DOCS] };
var AUTH_HEADER = /^(?:authorization|x-api-key|api-key|x-auth-token|x-token|proxy-authorization)$/i;
var ag009 = defineRule(M009, MCP_KINDS, (file) => {
  const out = [];
  for (const s of mcpServers(file)) {
    const urlKey = ["url", "httpUrl", "serverUrl"].find((k) => isStr(s.def[k]));
    if (!urlKey) continue;
    const url = s.def[urlKey];
    if (url.includes("${")) {
      if (/^http:\/\/\$\{/.test(url)) out.push(finding(M009, file, [...s.path, urlKey], { severity: "medium", confidence: "low", title: `MCP "${s.name}" uses http:// with a variable host`, whyItMatters: "Traffic, including tokens, is unencrypted unless the variable resolves to loopback.", evidence: url, fix: "Use https://." }));
      continue;
    }
    const host = parseHost(url);
    if (!host) continue;
    const plain = /^(?:http|ws):\/\//i.test(url);
    if (plain && !isLoopback(host)) {
      out.push(finding(M009, file, [...s.path, urlKey], { confidence: "high", title: `MCP "${s.name}" connects to ${host} over plain ${url.startsWith("ws") ? "ws" : "http"}`, whyItMatters: "Credentials and tool data cross the network unencrypted and can be read or altered in transit.", evidence: url, fix: "Switch to https:// (or wss://) or a loopback address." }));
      continue;
    }
    if (!isLoopback(host)) {
      const headers = isObj(s.def.headers) ? Object.keys(s.def.headers) : [];
      const hasAuth = headers.some((h) => AUTH_HEADER.test(h)) || s.def.oauth !== void 0 || s.def.headersHelper !== void 0 || s.def.bearer_token_env_var !== void 0 || s.def.http_headers !== void 0 || s.def.env_http_headers !== void 0 || /[?&](?:api[_-]?key|token)=/i.test(url);
      if (!hasAuth) {
        out.push(finding(M009, file, [...s.path, urlKey], { severity: "medium", confidence: "low", title: `MCP "${s.name}" (${host}) has no visible authentication`, whyItMatters: "No auth header or OAuth block is configured here. Some clients negotiate OAuth automatically, so this may be fine; an open endpoint means anyone can call it, and a malicious one can feed tool output to your agent.", evidence: url, fix: "Confirm the server authenticates, and prefer OAuth or a header sourced from an environment variable." }));
      }
    }
  }
  return out;
});
var M010 = { id: "AG-010", title: "MCP server with overbroad filesystem or command access", category: "permissions", defaultSeverity: "high", references: [MCP_DOCS] };
var BROAD_ROOT = /^(?:\/|~\/?|\$HOME\/?|\$\{HOME\}\/?|%USERPROFILE%\\?|[A-Za-z]:[\\/]?|\/(?:home|Users)\/[^/\\]+\/?|[A-Za-z]:[\\/]Users[\\/][^\\/]+[\\/]?|\.\.(?:[\\/].*)?)$/;
var EXEC_PKG = /(?:desktop-commander|mcp-server-commands|shell[-_]?(?:mcp|server)|(?:mcp|server)[-_]?shell|terminal[-_]?(?:mcp|server)|ssh[-_]?(?:mcp|server)|exec[-_]?(?:mcp|server)|run[-_]?command)/i;
var ag010 = defineRule(M010, MCP_KINDS, (file) => {
  const out = [];
  for (const s of mcpServers(file)) {
    const launch = effectiveLaunch(s.def);
    if (!launch) continue;
    const args = launch.args;
    const joined = [launch.cmd, ...args].join(" ");
    if (/server-filesystem|mcp-server-filesystem|filesystem-mcp/i.test(joined)) {
      args.forEach((a, i) => {
        if (a.startsWith("-") || /server-filesystem|filesystem-mcp/i.test(a)) return;
        if (BROAD_ROOT.test(a.trim())) out.push(finding(M010, file, [...s.path, "args", launch.argsOffset + i], { confidence: "high", title: `Filesystem MCP "${s.name}" is rooted at ${a}`, whyItMatters: "The server can read and write everything under this directory, including SSH keys, cloud credentials and browser data.", evidence: joined, fix: "Root it at the project directory only." }));
      });
    }
    if (baseName(launch.cmd) === "docker" || baseName(launch.cmd) === "podman") {
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        const next = args[i + 1] ?? "";
        const vol = a === "-v" || a === "--volume" || a === "--mount" ? next : a.startsWith("--volume=") || a.startsWith("-v=") || a.startsWith("--mount=") ? a.split("=").slice(1).join("=") : "";
        const src = vol.replace(/^(?:type=bind,)?(?:source|src)=/, "").split(/[:,]/)[0] ?? "";
        const sockets = /docker\.sock/.test(vol);
        if (a === "--privileged" || sockets || vol && BROAD_ROOT.test(src)) {
          out.push(finding(M010, file, [...s.path, "args", launch.argsOffset + i], { confidence: "high", title: `Container for MCP "${s.name}" ${a === "--privileged" ? "runs privileged" : sockets ? "mounts the Docker socket" : `mounts ${src}`}`, whyItMatters: "A broad host mount or privileged container removes the isolation the container was meant to provide.", evidence: joined, fix: "Mount only the project directory, read-only where possible." }));
        }
      }
    }
    if (EXEC_PKG.test(joined) || EXEC_PKG.test(s.name)) {
      out.push(finding(M010, file, s.path, { severity: "medium", confidence: "low", title: `MCP "${s.name}" looks like a command-execution server`, whyItMatters: "Heuristic (name/package match, unverified): servers that expose a shell tool let an injected instruction run arbitrary commands.", evidence: joined, fix: "Confirm you need it; prefer servers exposing narrow, specific tools." }));
    }
  }
  return out;
});
var M008 = { id: "AG-008", title: "Hardcoded secret", category: "secrets", defaultSeverity: "high", references: [MCP_DOCS] };
function walkStrings(v, path, cb, depth = 0) {
  if (depth > 40) return;
  if (isStr(v)) cb(v, path, typeof path[path.length - 1] === "string" ? path[path.length - 1] : void 0);
  else if (Array.isArray(v)) v.forEach((x, i) => walkStrings(x, [...path, i], cb, depth + 1));
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) walkStrings(x, [...path, k], cb, depth + 1);
}
function classifySecret(name, val) {
  if (name === "Google API key")
    return { name, severity: "medium", confidence: "medium", note: " Google API keys are often browser keys restricted by referrer or API; check its restrictions before deciding whether to rotate it." };
  if (name === "JWT") {
    const claims = decodeJwt(val);
    if (claims) {
      const role = String(claims.role ?? claims.user_role ?? "").toLowerCase();
      if (/^(?:anon|anonymous|public)$/.test(role))
        return { name: "JWT (public/anon role)", severity: "low", confidence: "medium", note: ` Decoded role is "${role}", normally a public client key (for example a Supabase anon key); it is only safe if access is enforced server-side.` };
      if (/service_role|admin|superuser/.test(role))
        return { name: "JWT (privileged role)", severity: "high", confidence: "high", note: ` Decoded role is "${role}", a privileged key.` };
      if (typeof claims.exp === "number" && claims.exp * 1e3 < Date.now())
        return { name: "JWT (expired)", severity: "medium", confidence: "medium", note: " The token has expired, but it may still reveal the issuer and subject." };
    }
  }
  return { name, severity: "high", confidence: "high", note: "" };
}
var ag008 = defineRule(M008, ALL_KINDS, (file) => {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const report2 = (name, secret, at, idxRange, severity, confidence, extra) => {
    const key = `${at?.join(".") ?? ""}|${secret}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(finding(M008, file, at, {
      severity,
      confidence,
      range: idxRange,
      title: `${name} in ${file.path}`,
      whyItMatters: `A credential committed to a repository is readable by everyone with access and by any agent that reads the file.${extra}`,
      evidence: redact(secret),
      fix: "Revoke the credential, then reference an environment variable (e.g. ${MY_TOKEN}) instead of embedding it.",
      jsonPath: at ?? [secret.length.toString()],
      autofix: at && !/URL|Private key/.test(name) ? envRefEdit(file, at, secret) : void 0
    }));
  };
  if (file.parsed !== void 0 && !file.parseError) {
    walkStrings(file.parsed, [], (s, path, key) => {
      if (s.length > 2e4) return;
      let matched = false;
      for (const pat of SECRET_PATTERNS) {
        pat.re.lastIndex = 0;
        for (const m of s.matchAll(pat.re)) {
          const val = m[0];
          if (isKnownSample(val) || isEnvReference(val) && pat.name !== "Private key block") continue;
          matched = true;
          {
            const c = classifySecret(pat.name, val);
            report2(c.name, val, path, void 0, c.severity, c.confidence, c.note);
          }
        }
      }
      if (!matched && key && SECRET_KEY_NAME.test(key) && !isEnvReference(s) && !isPlaceholder(s) && s.length >= 12 && !/\s/.test(s) && !/^(?:https?:|\/|\.|[A-Za-z]:\\)/.test(s) && !/^(?:true|false|bearer|basic)$/i.test(s)) {
        const underEnvOrHeaders = path.some((p) => p === "env" || p === "headers" || p === "http_headers");
        if (underEnvOrHeaders || /(?:token|secret|passw|api[_-]?key|private)/i.test(key)) {
          const ent = shannonEntropy(s);
          report2("Possible hardcoded secret (key-name heuristic)", s, path, void 0, "medium", ent >= 3.5 ? "medium" : "low", ent >= 3.5 ? " High character entropy raised confidence." : "");
        }
      }
      const b = /^(?:Bearer|Token|Basic)\s+([A-Za-z0-9._~+/=-]{16,})$/.exec(s);
      if (b && !isEnvReference(s) && !isPlaceholder(b[1]) && !matched && !isKnownSample(s)) report2("Literal bearer credential", b[1], path, void 0, "high", "medium", "");
    });
  } else {
    const idx = new LineIndex(file.text);
    for (const pat of SECRET_PATTERNS) {
      if (file.text.length > 2e6) break;
      pat.re.lastIndex = 0;
      for (const m of file.text.matchAll(pat.re)) {
        const val = m[0];
        if (isKnownSample(val) || isEnvReference(val) && pat.name !== "Private key block") continue;
        if (pat.name === "Credentials in URL" || pat.name === "Secret in URL query") continue;
        {
          const c = classifySecret(pat.name, val);
          report2(c.name, val, void 0, idx.range(m.index, m.index + val.length), c.severity, c.confidence, c.note);
        }
      }
    }
  }
  return out;
});
var mcpRules = [ag006, ag007, ag008, ag009, ag010];

// ../core/src/rules/intel-rule.ts
var MCP_PACKAGE_INTEL = mcp_packages_default.entries;
var M011 = { id: "AG-011", title: "MCP server uses a known-bad or known-vulnerable package", category: "supply-chain", defaultSeverity: "high" };
function parseVer(s) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(s.trim());
  return m ? { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? "" } : void 0;
}
function cmpVer(a, b) {
  for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return a.nums[i] < b.nums[i] ? -1 : 1;
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  return a.pre < b.pre ? -1 : 1;
}
function inRange(version, range) {
  const v = parseVer(version);
  if (!v) return void 0;
  for (const c of range.split(/\s+/).filter(Boolean)) {
    const m = /^(>=|<=|>|<|=)?(.+)$/.exec(c);
    const bound = m ? parseVer(m[2]) : void 0;
    if (!m || !bound) return void 0;
    const d = cmpVer(v, bound);
    const op = m[1] ?? "=";
    const ok = op === ">=" ? d >= 0 : op === "<=" ? d <= 0 : op === ">" ? d > 0 : op === "<" ? d < 0 : d === 0;
    if (!ok) return false;
  }
  return true;
}
var norm = (n) => n.toLowerCase();
function checkIntel(name, version, eco, entries) {
  for (const e of entries) {
    if (e.ecosystem !== eco || norm(e.package) !== norm(name)) continue;
    if (version !== void 0) {
      const r = inRange(version, e.affected);
      if (r === true) return { entry: e, exact: true };
      if (r === false) continue;
    }
    if (e.kind === "malicious") return { entry: e, exact: false };
  }
  return void 0;
}
function makeAg011(entries = MCP_PACKAGE_INTEL) {
  return defineRule(M011, MCP_KINDS, (file, ctx) => {
    const usable = entries.filter((e) => e.verified === true || ctx.config.enableExperimentalRules);
    const out = [];
    for (const s of mcpServers(file)) {
      const launch = effectiveLaunch(s.def);
      if (!launch) continue;
      const found = packageOf(launch.cmd, launch.args);
      if (!found) continue;
      const hit = checkIntel(found.pkg.name, found.pkg.version, found.eco, usable);
      if (!hit) continue;
      const { entry } = hit;
      const at = [...s.path, "args", launch.argsOffset + found.pkg.index];
      const malicious = entry.kind === "malicious";
      const severity = malicious ? "critical" : "high";
      out.push(finding(M011, file, at, {
        severity,
        confidence: hit.exact ? "high" : "medium",
        subject: entry.kind,
        title: malicious ? `MCP "${s.name}" runs ${found.pkg.name}, a package reported as malicious` : `MCP "${s.name}" runs ${found.pkg.name}@${found.pkg.version}, a version with a known vulnerability`,
        whyItMatters: `${entry.issue}. Affected: ${entry.affected}${entry.fixedIn ? `; fixed in ${entry.fixedIn}` : ""}. Sources: ${entry.sources.join(", ")} (checked ${entry.accessed}).`,
        evidence: `${launch.cmd} ${launch.args.join(" ")}`,
        fix: malicious ? `Remove this server and rotate any credentials it could reach. ${hit.exact ? "" : "The version is not pinned, but the package should not be used at all."}`.trim() : `Upgrade to ${entry.fixedIn ?? "a fixed release"} or later and pin that exact version.`,
        ...entry.sources.length ? {} : {}
      }));
    }
    return out;
  });
}
var ag011 = makeAg011();
var intelRules = [ag011];

// ../core/src/rules/tasks-rule.ts
var M030 = {
  id: "AG-030",
  title: "VS Code task runs automatically on folder open",
  category: "persistence",
  defaultSeverity: "high",
  references: ["https://code.visualstudio.com/docs/debugtest/tasks#_run-behavior"]
};
function argText(a) {
  if (isStr(a)) return a;
  if (isObj(a) && isStr(a.value)) return a.value;
  return "";
}
function tasksCommands(parsed) {
  const out = [];
  if (!isObj(parsed) || !Array.isArray(parsed.tasks)) return out;
  parsed.tasks.forEach((t, i) => {
    if (!isObj(t)) return;
    const runOnOpen = isObj(t.runOptions) && t.runOptions.runOn === "folderOpen";
    const label = isStr(t.label) ? t.label : isStr(t.taskName) ? t.taskName : `task ${i}`;
    const variants = [[["tasks", i], t]];
    for (const os of ["windows", "linux", "osx"]) if (isObj(t[os])) variants.push([["tasks", i, os], t[os]]);
    for (const [base, v] of variants) {
      const cmd = argText(v.command);
      if (!cmd) continue;
      const args = Array.isArray(v.args) ? v.args.map(argText).join(" ") : "";
      out.push({ command: args ? `${cmd} ${args}` : cmd, path: [...base, "command"], runOnOpen, label });
    }
  });
  return out;
}
var BENIGN_TOOLS = /* @__PURE__ */ new Set(["tsc", "webpack", "vite", "esbuild", "rollup", "nodemon", "gulp", "jest", "vitest", "eslint", "prettier", "cargo", "go", "dotnet", "make", "mvn", "gradle", "gradlew", "flutter", "sass", "tailwindcss", "turbo"]);
var PKG_MANAGERS = /* @__PURE__ */ new Set(["npm", "pnpm", "yarn", "bun"]);
var ag030 = defineRule(M030, ["vscode-tasks"], (file, ctx) => {
  const out = [];
  for (const t of tasksCommands(file.parsed)) {
    if (!t.runOnOpen) continue;
    const a = analyzeCommand(t.command);
    const v = analyzeWithScripts(t.command, ctx);
    const first = baseName(t.command.trim().split(/\s+/)[0] ?? "");
    let severity;
    let confidence;
    if (a.network || a.pipeToShell || a.base64Exec || a.sensitiveRef || a.severity === "critical") {
      severity = "critical";
      confidence = "high";
    } else if (a.repoScript && v.chain.read.length > 0) {
      severity = v.chain.severity;
      confidence = "high";
    } else if (a.inlineInterp || a.shellWrapper) {
      severity = "high";
      confidence = "high";
    } else if (a.repoScript) {
      severity = "medium";
      confidence = "low";
    } else if (BENIGN_TOOLS.has(first)) {
      severity = "info";
      confidence = "medium";
    } else if (PKG_MANAGERS.has(first)) {
      severity = "medium";
      confidence = "low";
    } else {
      severity = "medium";
      confidence = "low";
    }
    if (v.chain.read.length > 0 && sevRank(v.chain.severity) > sevRank(severity)) severity = v.chain.severity;
    const signals = v.signals;
    out.push(finding(M030, file, t.path, {
      severity,
      confidence,
      title: `Task "${t.label}" runs on folder open${signals.length ? ` (${signals.join(", ")})` : ""}`,
      whyItMatters: "A task with runOn: folderOpen starts when the folder is opened (after VS Code's automatic-task prompt, which is easy to accept). A Keyv-linked npm worm used this for persistence (see docs/SOURCES.md).",
      evidence: t.command + v.chainEvidence,
      fix: 'Remove runOptions.runOn or the task. Keep "task.allowAutomaticTasks" at its default.'
    }));
  }
  return out;
});
var taskRules = [ag030];

// ../core/src/rules/instruction-rules.ts
function sentenceLines(lines, i, sentence) {
  const t = sentence.trim();
  const startsOnFirst = (lines[i] ?? "").includes(t.slice(0, Math.min(30, t.length)));
  const start = startsOnFirst ? i : Math.min(i + 1, lines.length - 1);
  const end = (lines[start] ?? "").includes(t) ? start : Math.min(start + 1, lines.length - 1);
  return [start, end];
}
var URL_RE = /https?:\/\/[^\s)>\]"'`]+/gi;
var STRONG_SECRET = /(?:\.env(?!\.(?:example|sample|template|dist|defaults?)(?![\w-]))(?:\.\w+)?(?![\w-])|~\/\.ssh|\.ssh(?![\w-])|id_(?:rsa|ed25519|ecdsa)|\.aws(?![\w-])|aws credentials|credentials?(?![\w-])|private keys?|\.npmrc|\.netrc|\.pem(?![\w-])|ssh keys?)/i;
var WEAK_SECRET = /(?:secrets?(?![\w-])|api[ _-]?keys?|access tokens?|auth tokens?|tokens?(?![\w-])|passwords?|environment variables?|env vars?)/i;
var STRONG_VERB = /\b(?:send|post|upload|exfiltrat\w*|transmit|forward|e-?mail|sync|back ?up|submit|leak|dump|curl|wget|paste)\b/gi;
var PRETEXT = /\b(?:team sync|security scan|security check|compliance|audit|telemetry|onboarding|diagnostics?|health ?check|back ?up)\b/i;
var BODY = (n) => String.raw`(?:[^!?;\n.]|\.(?!\s|$)){0,` + n + "}";
var NEGATION = new RegExp(
  String.raw`(?:\bnever\b|\bdo not\b|\bdon't\b|\bmust not\b|\bmustn't\b|\bshould not\b|\bshouldn't\b|\bavoid\b|\bcannot\b|\bcan't\b|\bnot\b|\bwithout\b)(?!.*\b(?:but|however|except|instead)\b)` + BODY(120) + "$",
  "i"
);
function negated(before) {
  return NEGATION.test(before.slice(-160));
}
function sentencePairs(real) {
  const masked = real.replace(URL_RE, (u) => "u".repeat(u.length));
  const out = [];
  let pos = 0;
  for (const part of masked.split(/(?<=[.!?])\s+|\n+/)) {
    const at = masked.indexOf(part, pos);
    if (at < 0) continue;
    pos = at + part.length;
    if (part.trim().length > 0) out.push({ m: part, r: real.slice(at, at + part.length) });
  }
  return out;
}
function exfilInSentence(sentence, context) {
  const strong = STRONG_SECRET.exec(sentence);
  const weak = strong ? null : WEAK_SECRET.exec(sentence);
  const sec = strong ?? weak;
  if (!sec) return void 0;
  STRONG_VERB.lastIndex = 0;
  let verbOk = false;
  let verb = "";
  for (const m of sentence.matchAll(STRONG_VERB)) {
    if (Math.abs(m.index - sec.index) > 110) continue;
    if (negated(sentence.slice(0, m.index))) continue;
    verbOk = true;
    verb = m[0].toLowerCase();
    break;
  }
  if (!verbOk) return void 0;
  const urls = [...context.matchAll(URL_RE)].map((m) => m[0]);
  const pretext = PRETEXT.test(sentence);
  if (urls.length) {
    const classes = urls.map((u) => parseHost(u)).filter((h) => !!h).map((h) => exfilClass(h)).filter(Boolean);
    return {
      severity: classes.length ? "critical" : strong ? "high" : "medium",
      confidence: strong ? "high" : "medium",
      why: `Instructs the agent to ${verb} ${strong ? "secret/credential material" : "secrets"} to ${urls[0]}${classes.length ? ` (${classes[0]} class)` : ""}.`
    };
  }
  if (strong && ["send", "post", "upload", "exfiltrate", "transmit", "forward", "email", "e-mail", "sync", "back up", "backup", "leak"].includes(verb.replace(/\w*exfiltrat\w*/, "exfiltrate")))
    return { severity: pretext ? "high" : "medium", confidence: "low", why: `Instructs the agent to ${verb} secret material; no destination named.` };
  return void 0;
}
var SILENCE = [
  { re: /\b(?:ignore|disregard|forget|override)\b[^.!?\n]{0,40}\b(?:previous|prior|above|earlier|system|all|any|other)\b[^.!?\n]{0,30}\b(?:instructions?|rules?|prompts?|guidelines?|polic(?:y|ies)|safeguards?)\b/i, severity: "high", confidence: "medium", title: "Tells the agent to ignore its other instructions", checkNeg: true },
  { re: /\b(?:do not|don't|never|without)\s+(?:\w+\s+){0,2}(?:tell(?:ing)?|inform(?:ing)?|notify(?:ing)?|alert(?:ing)?|show(?:ing)?|reveal(?:ing)?|mention(?:ing)?)\b[^.!?\n]{0,25}\b(?:the )?(?:user|developer|human|operator)\b/i, severity: "high", confidence: "medium", title: "Tells the agent to hide actions from the user" },
  { re: /\b(?:hide|conceal|suppress)\b[^.!?\n]{0,30}\b(?:this|these|that|it|output|actions?|commands?)\b[^.!?\n]{0,30}\b(?:from|to)\b[^.!?\n]{0,10}\b(?:the )?(?:user|developer|human)\b|\b(?:silently|secretly|covertly|quietly)\s+(?:(?:and|then)\s+)?(?:run|execute|send|upload|post|install|download|write|add|modify|curl|fetch|exfiltrate|email|forward)\b/i, severity: "high", confidence: "medium", title: "Tells the agent to act covertly" },
  // "do this quietly", "no need to mention it to the user", "keep this out of your summaries", "the developer does not need to be told"
  { re: /\b(?:do|perform|run|handle|complete)\s+(?:this|it|that|these)\s+(?:quietly|silently|secretly|covertly|discreetly)\b|\b(?:there is |there's )?no need to\s+(?:mention|tell|inform|notify|alert|show|surface|report|disclose|reveal)\b[^.!?\n]{0,30}\b(?:user|developer|human|operator|anyone|them)\b|\bkeep\s+(?:this|it|that|these)\b[^.!?\n]{0,40}\b(?:out of|from|away from)\b[^.!?\n]{0,25}\b(?:summar(?:y|ies)|the user|the developer|the response|your (?:reply|replies|report|reports))\b|\b(?:the\s+)?(?:user|developer|human|operator)\s+(?:(?:does not|doesn't|should not|shouldn't|must not)\s+(?:need to\s+(?:be told|be informed|be notified|know)|be (?:told|informed|notified))|need not\s+(?:know|be (?:told|informed|notified)))\b/i, severity: "high", confidence: "medium", title: "Tells the agent to keep an action from the user" },
  { re: /\b(?:approved|authori[sz]ed|pre-?approved|signed off|cleared|sanctioned)\s+by\s+(?:the\s+|your\s+)?(?:security|admin(?:istrators?)?|compliance|management|anthropic|it|ciso|operator)\b/i, severity: "high", confidence: "medium", title: "Claims approval by an authority to lower scrutiny" },
  { re: /\b(?:disable|turn off|bypass|skip|circumvent|override)\b[^.!?\n]{0,30}\b(?:safety|security|sandbox|permissions?|approvals?|guardrails?|safeguards?|confirmations?|warnings?)(?:\s+(?:checks?|prompts?|dialogs?|mode))?\b/i, severity: "medium", confidence: "medium", title: "Tells the agent to bypass safeguards", checkNeg: true },
  { re: /\b(?:without|never|do not|don't)\s+(?:asking|ask|prompt(?:ing)?|requir(?:e|ing)|wait(?:ing)? for)\s+(?:for\s+)?(?:the user'?s?\s+)?(?:confirmation|permission|approval|consent)\b/i, severity: "medium", confidence: "low", title: "Tells the agent to act without confirmation" }
];
var PROP_TARGET = /(?:CLAUDE(?:\.local)?\.md|AGENTS\.md|GEMINI\.md|\.cursorrules|\.cursor\/rules|copilot-instructions|\.windsurfrules|\.clinerules|\.mcp\.json|\.claude\/settings|\.claude\/hooks?|\.claude\/commands|\.claude\/agents|\.vscode\/tasks\.json|hooks?\b[^.\n]{0,15}\bconfig)/i;
var PROP_SPREAD = new RegExp(
  String.raw`(?:\bpropagat\w+|\bspread\b|\breplicat\w+|\bself-?replicat\w+|\binfect\w*|\bcopy (?:this|these|the) (?:file|instructions?|section|text|block|rules?) (?:in)?to (?:every|all|each|other|any)\b|\b(?:in|into|to) (?:all|every|each|any|other) (?:other )?(?:repos(?:itor(?:y|ies))?|projects?|packages?|branches|forks|workspaces)\b|\b(?:embed|include|insert|add|append)\b` + BODY(60) + String.raw`\b(?:in|into|to)\b` + BODY(20) + String.raw`\b(?:issues?|pull requests?|PRs?|READMEs?|documentation|docs|comments?|commit messages?)\b)`,
  "i"
);
var PROP_VERB = /\b(?:embed|creat|writ|add|append|modif|updat|insert|inject|plant|cop(?:y|ie)|install|plac|drop|persist|propagat|spread|replicat)\w*/i;
function analyzeInstructionText(text2) {
  const out = [];
  const lines = text2.split(/\r?\n/);
  const reported = /* @__PURE__ */ new Set();
  for (let i = 0; i < lines.length; i++) {
    const win = (lines[i] + (i + 1 < lines.length ? " " + lines[i + 1] : "")).replace(/[ 	]+/g, " ");
    if (win.trim() === "" || win.length > 2e4) continue;
    const mwin = win.replace(URL_RE, (u) => "u".repeat(u.length));
    const sents = sentencePairs(win);
    if (!reported.has(`AG-021:${i - 1}`)) {
      for (const { m: ms, r: s } of sents) {
        const r = exfilInSentence(ms, win);
        if (r) {
          reported.add(`AG-021:${i}`);
          const [l0, l1] = sentenceLines(lines, i, s);
          out.push({ rule: "AG-021", severity: r.severity, confidence: r.confidence, title: "Instruction to read secrets and send them elsewhere", why: r.why, line: l0, endLine: l1, evidence: s.trim() });
          break;
        }
      }
    }
    for (const p of SILENCE) {
      const m = p.re.exec(mwin);
      if (!m || reported.has(`AG-022:${p.title}:${i - 1}`)) continue;
      if (p.checkNeg && negated(mwin.slice(0, m.index))) continue;
      if (/\b(?:never|do not|don't)\s+(?:let|allow)\b/i.test(mwin.slice(Math.max(0, m.index - 30), m.index))) continue;
      reported.add(`AG-022:${p.title}:${i}`);
      out.push({ rule: "AG-022", severity: p.severity, confidence: p.confidence, title: p.title, why: "Language that tells an agent to hide actions, drop its guardrails or claim authority is a common prompt-injection pattern.", line: sentenceLines(lines, i, m[0])[0], endLine: sentenceLines(lines, i, m[0])[1], evidence: m[0] });
    }
    if (!reported.has(`AG-023:${i - 1}`)) {
      for (const { m: ms, r: s } of sents) {
        if (PROP_TARGET.test(ms) && PROP_VERB.test(ms) && PROP_SPREAD.test(ms) && !negated(ms.slice(0, Math.max(0, ms.search(PROP_VERB))))) {
          reported.add(`AG-023:${i}`);
          out.push({ rule: "AG-023", severity: "high", confidence: "medium", title: "Instruction to copy agent configuration into other places", why: "Text that tells the agent to write or spread agent-config files into other repositories, issues or docs matches the self-propagation behaviour described for TrapDoor (see docs/SOURCES.md).", line: sentenceLines(lines, i, s)[0], endLine: sentenceLines(lines, i, s)[1], evidence: s.trim() });
          break;
        }
      }
    }
  }
  return out;
}
function hitRule(meta, ruleId) {
  return defineRule(meta, INSTRUCTION_KINDS, (file) => {
    const out = [];
    const lines = file.text.split(/\r?\n/);
    for (const h of analyzeInstructionText(file.text)) {
      if (h.rule !== ruleId) continue;
      const lastLine = h.endLine;
      out.push(finding(meta, file, void 0, {
        severity: h.severity,
        confidence: h.confidence,
        title: h.title,
        whyItMatters: h.why,
        evidence: h.evidence,
        fix: "Delete the instruction (preview the change before applying) and check who added it with git blame.",
        range: { startLine: h.line, startCol: 0, endLine: lastLine, endCol: (lines[lastLine] ?? "").length },
        jsonPath: [`line-text:${h.evidence.slice(0, 80)}`]
      }));
    }
    return out;
  });
}
var M021 = { id: "AG-021", title: "Exfiltration instruction", category: "exfiltration", defaultSeverity: "high", references: ["https://www.pillar.security/blog/new-vulnerability-in-github-copilot-and-cursor-how-hackers-can-weaponize-code-agents"] };
var M022 = { id: "AG-022", title: "Silence or override instruction", category: "hidden-text", defaultSeverity: "high" };
var M023base = { id: "AG-023", title: "Agent-config self-propagation", category: "persistence", defaultSeverity: "high" };
var ag021 = hitRule(M021, "AG-021");
var ag022 = hitRule(M022, "AG-022");
var WRITES_CONFIG = /(?:>>?|\btee\b(?:\s+-a)?|\bcp\b|\bmv\b|\bsed\s+-i\S*|\bcopy\b|\bout-file\b|\badd-content\b|\bset-content\b)[^|;&\n]{0,80}?(?:CLAUDE(?:\.local)?\.md|AGENTS\.md|GEMINI\.md|\.cursorrules|\.cursor[\\/]rules|copilot-instructions|\.windsurfrules|\.clinerules|\.mcp\.json|\.claude[\\/]settings|\.claude[\\/]hooks|\.vscode[\\/]tasks\.json)/i;
var textPart = hitRule(M023base, "AG-023");
var ag023 = defineRule(M023base, [...INSTRUCTION_KINDS, ...SETTINGS_KINDS, "vscode-tasks"], (file, ctx) => {
  if (INSTRUCTION_KINDS.includes(file.kind)) return textPart.run(file, ctx);
  const cmds = file.kind === "vscode-tasks" ? tasksCommands(file.parsed).map((t) => ({ command: t.command, path: t.path })) : settingsCommands(file.parsed);
  const out = [];
  for (const c of cmds) {
    if (WRITES_CONFIG.test(c.command.replace(/['"]/g, ""))) {
      void analyzeCommand;
      out.push(finding(M023base, file, c.path, {
        confidence: "medium",
        title: "Automatic command writes to agent configuration files",
        whyItMatters: "A hook or task that edits CLAUDE.md, .mcp.json, hooks or rules can plant itself in other projects or persist after the original entry is removed (Keyv-linked worm behaviour, see docs/SOURCES.md).",
        evidence: c.command,
        fix: "Remove the entry unless you wrote it and understand why it edits agent configuration."
      }));
    }
  }
  return out;
});
var M020 = { id: "AG-020", title: "Hidden Unicode characters", category: "hidden-text", defaultSeverity: "high", references: ["https://www.pillar.security/blog/new-vulnerability-in-github-copilot-and-cursor-how-hackers-can-weaponize-code-agents"] };
var ag020 = defineRule(M020, ALL_KINDS, (file) => {
  const out = [];
  const runs = findHidden(file.text);
  if (!runs.length) return out;
  const idx = new LineIndex(file.text);
  for (const r of runs) {
    const range = idx.range(r.start, r.end);
    const raw = file.text.slice(r.start, r.end);
    let severity;
    let confidence;
    let title;
    let evidence;
    const decoded = r.decoded;
    if (decoded && decoded.trim().length >= 8) {
      const hits = analyzeInstructionText(decoded);
      severity = "critical";
      confidence = "high";
      title = hits.length ? `Hidden text decodes to an instruction (${hits[0].title.toLowerCase()})` : "Hidden text decodes to readable content";
      evidence = `decoded: "${decoded.replace(/\s+/g, " ").trim()}"  | raw: ${raw.slice(0, 40)}`;
    } else {
      const kinds = r.kinds.join("+");
      const structured = isObj(file.parsed);
      if (r.kinds.includes("bidi")) {
        severity = structured || INSTRUCTION_KINDS.includes(file.kind) ? "high" : "medium";
        confidence = "medium";
      } else if (r.kinds.includes("tag")) {
        severity = "high";
        confidence = "medium";
      } else if (r.codepoints.length >= 3) {
        severity = "high";
        confidence = "medium";
      } else {
        severity = "medium";
        confidence = "low";
      }
      title = `Hidden ${kinds} character${r.codepoints.length > 1 ? "s" : ""} (${r.codepoints.length})`;
      const lineText = file.text.split("\n")[range.startLine] ?? "";
      evidence = lineText.slice(Math.max(0, range.startCol - 25), range.startCol + 60);
    }
    out.push(finding(M020, file, void 0, {
      severity,
      confidence,
      title,
      range,
      whyItMatters: "Invisible characters are not shown in editors or diffs, but language models can read them. They can carry instructions a reviewer never sees (Rules File Backdoor class, see docs/SOURCES.md).",
      evidence,
      fix: "Delete the invisible characters (the preview shows exactly which), then review the surrounding text.",
      jsonPath: ["hidden", r.kinds.join("+"), String(r.codepoints.length)],
      autofix: [{ file: file.path, description: `Remove ${r.codepoints.length} hidden character(s)`, edits: [{ range, newText: "" }] }]
    }));
  }
  void renderVisible;
  void isStr;
  return out;
});
var instructionRules = [ag020, ag021, ag022, ag023];

// ../core/src/rules/mcp-script-rule.ts
var M013 = {
  id: "AG-013",
  title: "MCP server launches a repo script with risky behaviour",
  category: "mcp",
  defaultSeverity: "high",
  references: ["https://code.claude.com/docs/en/mcp"]
};
var ag013 = defineRule(M013, MCP_KINDS, (file, ctx) => {
  const out = [];
  for (const s of mcpServers(file)) {
    const launch = effectiveLaunch(s.def);
    if (!launch) continue;
    const line = [launch.cmd, ...launch.args].join(" ");
    const chain = followScripts(line, ctx);
    if (!chain.read.length || sevRank(chain.severity) < sevRank("high")) continue;
    out.push(finding(M013, file, [...s.path, "command"], {
      severity: chain.severity,
      confidence: "medium",
      title: `MCP "${s.name}" launches ${chain.read[0]}, which ${chain.evidence.map((e) => e.signal).filter((v, i, a) => a.indexOf(v) === i).join(", ")}`,
      whyItMatters: "The server's launch script was read as text (never executed). It contains behaviour that is unusual for a tool server and runs with your privileges as soon as the server starts.",
      evidence: line + `
  chain: ${chain.read.join(" \u2192 ")}` + chain.evidence.map((e) => `
  ${e.path}:${e.line} [${e.signal}] ${e.snippet}`).join(""),
      fix: "Review the script before approving the server; remove the server if you do not recognise its behaviour."
    }));
  }
  return out;
});
var mcpScriptRules = [ag013];

// ../core/src/rules/pack-b/index.ts
var packB = [];

// ../core/src/rules/registry-rule.ts
var M014 = {
  id: "AG-014",
  title: "Package registry or index redirected",
  category: "supply-chain",
  defaultSeverity: "high"
};
var ENV_KEY = /^(?:npm_config_(?:registry|@[\w-]+:registry)|pnpm_config_registry|yarn_npm_registry_server|pip_(?:extra_)?index_url|pip_find_links|uv_(?:default_|extra_)?index(?:_url)?|uv_index_\w+|goproxy|poetry_repositories_\w+_url)$/i;
var ARG_FLAG = /^(--registry|--index-url|--extra-index-url|--index|--default-index|--find-links)(?:=(.*))?$/;
function judge(value) {
  if (value.includes("${") || /\$[A-Za-z_]/.test(value)) return { flagged: true, host: void 0, level: "variable" };
  const host = parseHost(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : "https://" + value);
  if (!host) return { flagged: false };
  if (isDefaultRegistryHost(host)) return { flagged: false };
  if (isLoopback(host)) return { flagged: true, host, level: "loopback" };
  return { flagged: true, host, level: "unknown-host" };
}
var WHY = "A repository-chosen registry or index serves the packages the agent and its tools install, so it can substitute malicious versions of ordinary dependencies (dependency-confusion / registry-redirect supply-chain risk). A private company mirror looks the same in a static file, hence medium confidence.";
function sev(level, base) {
  if (level === "loopback") return { severity: "low", confidence: "medium" };
  if (level === "variable") return { severity: "medium", confidence: "low" };
  return { severity: base, confidence: "medium" };
}
var FILE_LINE_PATTERNS = [
  /^\s*(?:@[\w.-]+:)?registry\s*=\s*(\S+)/i,
  /^\s*npmRegistryServer\s*:\s*["']?([^"'\s]+)["']?/i,
  /^\s*(?:extra-)?index[-_]url\s*[=:]\s*(\S+)/i,
  /^\s*(?:find-links|default-index|extra-index-url)\s*[=:]\s*["']?([^"'\s]+)["']?/i,
  /^\s*url\s*=\s*["']([^"']+)["']/i
  // uv.toml [[index]] entries
];
var ag014 = defineRule(M014, [...SETTINGS_KINDS, ...MCP_KINDS, "pkg-registry-config"], (file, ctx) => {
  const out = [];
  if (file.kind === "pkg-registry-config") {
    const lines = file.text.split(/\r?\n/);
    lines.forEach((raw, i) => {
      if (raw.length > 2e3) return;
      const t = raw.trim();
      if (!t || t.startsWith("#") || t.startsWith(";") || t.startsWith("//")) return;
      for (const re of FILE_LINE_PATTERNS) {
        const m = re.exec(raw);
        if (!m) continue;
        const v = judge(m[1]);
        if (v.flagged) {
          const { severity, confidence } = sev(v.level, "medium");
          const range = { startLine: i, startCol: 0, endLine: i, endCol: raw.replace(/\r$/, "").length };
          out.push(finding(M014, file, void 0, {
            severity,
            confidence,
            range,
            title: `Package registry/index set to ${v.host ?? "a variable"} in ${file.path}`,
            whyItMatters: WHY,
            evidence: t,
            fix: "Remove the override, or confirm the host is your organization's registry.",
            jsonPath: ["registry", String(i)]
          }));
        }
        break;
      }
    });
    return out;
  }
  const p = file.parsed;
  if (!isObj(p)) return out;
  if (SETTINGS_KINDS.includes(file.kind) && isObj(p.env)) {
    const shared = file.kind === "claude-settings" || ctx.trackedFiles?.has(file.path) === true;
    for (const [key, val] of Object.entries(p.env)) {
      if (!ENV_KEY.test(key) || !isStr(val)) continue;
      const v = judge(val);
      if (!v.flagged) continue;
      const { severity, confidence } = sev(v.level, shared ? "high" : "medium");
      out.push(finding(M014, file, ["env", key], {
        severity,
        confidence,
        title: `${key} redirects package installs to ${v.host ?? "a variable"}`,
        whyItMatters: WHY,
        evidence: `${key}=${val}`,
        fix: `Remove ${key} from the project settings file.`
      }));
    }
  }
  if (MCP_KINDS.includes(file.kind)) {
    for (const s of mcpServers(file)) {
      if (isObj(s.def.env)) {
        for (const [key, val] of Object.entries(s.def.env)) {
          if (!ENV_KEY.test(key) || !isStr(val)) continue;
          const v = judge(val);
          if (!v.flagged) continue;
          const { severity, confidence } = sev(v.level, "medium");
          out.push(finding(M014, file, [...s.path, "env", key], { severity, confidence, title: `MCP "${s.name}" sets ${key} to ${v.host ?? "a variable"}`, whyItMatters: WHY, evidence: `${key}=${val}`, fix: "Remove the override." }));
        }
      }
      const args = strArgs(s.def);
      args.forEach((a, i) => {
        const m = ARG_FLAG.exec(a);
        if (!m) return;
        const value = m[2] ?? args[i + 1];
        if (!value) return;
        const v = judge(value);
        if (!v.flagged) return;
        const { severity, confidence } = sev(v.level, "medium");
        out.push(finding(M014, file, [...s.path, "args", i], { severity, confidence, title: `MCP "${s.name}" installs from ${v.host ?? "a variable"} (${m[1]})`, whyItMatters: WHY, evidence: `${s.def.command} ${args.join(" ")}`, fix: "Remove the flag or use the default registry." }));
      });
    }
  }
  return out;
});
var registryRules = [ag014];

// ../core/src/rules/registry.ts
var ALL_RULES = [
  ...settingsRules,
  ...mcpRules,
  ...mcpScriptRules,
  ...registryRules,
  ...instructionRules,
  ...taskRules,
  ...blobRules,
  ...agentRules,
  ...intelRules,
  // Pack B is always experimental: forced here so a rule cannot forget the flag.
  ...packB.map((r) => ({ ...r, experimental: true }))
];

// ../core/src/engine/engine.ts
function findingKey(f) {
  return [f.ruleId, f.file, f.jsonPath ?? "", f.evidence].join("|");
}
var norm2 = (p) => p.replace(/\\/g, "/").replace(/^\.\//, "");
function scanFiles(files, opts = {}) {
  const config2 = opts.config ?? {};
  const rules = (opts.rules ?? ALL_RULES).filter((r) => !r.experimental || config2.enableExperimentalRules);
  const ctx = { files, repoRoot: opts.root ?? "", config: config2, trackedFiles: opts.trackedFiles, readFile: opts.readFile };
  const all = [];
  for (const file of files) {
    if (opts.only && !opts.only.has(file.path)) continue;
    if (file.parseError) {
      all.push({
        ruleId: "AG-000",
        severity: "low",
        confidence: "medium",
        category: "execution",
        title: "Config file could not be parsed",
        file: file.path,
        range: ZERO_RANGE,
        whyItMatters: `${PRODUCT.name} could not analyze this file. An agent with a more lenient parser may still read it.`,
        evidence: file.parseError,
        fix: "Fix the syntax error so the file can be reviewed."
      });
      continue;
    }
    if (file.parseWarning) {
      all.push({
        ruleId: "AG-000",
        severity: "low",
        confidence: "medium",
        category: "execution",
        title: "Config file has syntax errors",
        file: file.path,
        range: ZERO_RANGE,
        whyItMatters: `${PRODUCT.name} analyzed what it could. An agent with a different parser may read this file differently.`,
        evidence: file.parseWarning,
        fix: "Fix the syntax errors so the file can be reviewed fully."
      });
    }
    for (const rule2 of rules) {
      if (!rule2.appliesTo.includes(file.kind)) continue;
      try {
        all.push(...rule2.run(file, ctx));
      } catch (e) {
        all.push({
          ruleId: "AG-000",
          severity: "info",
          confidence: "low",
          category: "execution",
          title: `Rule ${rule2.id} failed`,
          file: file.path,
          range: ZERO_RANGE,
          whyItMatters: "A rule threw while scanning this file.",
          evidence: String(e).slice(0, 200),
          fix: "Report this as a bug."
        });
      }
    }
  }
  for (const f of all) redactFindingText(f);
  const seen = /* @__PURE__ */ new Set();
  const uniq = all.filter((f) => {
    const k = `${findingKey(f)}|${f.range.startLine}:${f.range.startCol}|${f.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const invalid = [];
  const sup = (config2.suppress ?? []).filter((s) => {
    if (!s.reason || !s.reason.trim()) {
      invalid.push(`${s.ruleId} ${s.file}: suppression needs a reason`);
      return false;
    }
    return true;
  });
  const findings = [];
  const suppressed = [];
  for (const f of uniq) {
    const s = sup.find((x) => x.ruleId === f.ruleId && norm2(x.file) === f.file);
    if (s) suppressed.push({ finding: f, reason: s.reason });
    else findings.push(f);
  }
  findings.sort(compareFindings);
  return { findings, suppressed, invalidSuppressions: invalid };
}
var confRank = { high: 2, medium: 1, low: 0 };
function compareFindings(a, b) {
  return sevRank(b.severity) - sevRank(a.severity) || confRank[b.confidence] - confRank[a.confidence] || a.file.localeCompare(b.file) || a.range.startLine - b.range.startLine || a.ruleId.localeCompare(b.ruleId);
}

// ../core/src/config.ts
import { existsSync as existsSync2, readFileSync as readFileSync4 } from "node:fs";
import { join as join3 } from "node:path";
function parseConfig(text2) {
  try {
    const v = parse2(text2, [], { allowTrailingComma: true });
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function resolveConfigFile(exists, product = PRODUCT) {
  const cands = configFileCandidates(product);
  const present = cands.filter((c) => exists(c.name));
  if (!present.length) return { legacy: false, shadowed: [] };
  const [first, ...rest] = present;
  return { name: first.name, legacy: first.legacy, shadowed: rest.map((r) => r.name) };
}
function deprecationMessage(legacyName, product = PRODUCT) {
  return `${product.name}: "${legacyName}" is a deprecated config file name. Rename it to "${product.configFile}" (the old name is still read, but only while the new one is absent).`;
}
function loadConfig(root, opts = {}) {
  const product = opts.product ?? PRODUCT;
  const note = opts.onNote ?? ((m) => console.warn(m));
  const res = resolveConfigFile((n) => existsSync2(join3(root, n)), product);
  if (!res.name) return {};
  if (res.legacy) note(deprecationMessage(res.name, product));
  for (const s of res.shadowed) note(`${product.name}: "${s}" is ignored because "${res.name}" exists.`);
  try {
    return parseConfig(readFileSync4(join3(root, res.name), "utf8"));
  } catch {
    return {};
  }
}

// ../core/src/diff/identity.ts
import { createHash } from "node:crypto";
var stablePath = (jsonPath) => (jsonPath ?? "").replace(/(^|\.)\d+(?=\.|$)/g, "$1[]");
var normEvidence = (e) => e.replace(/\s+/g, " ").replace(/:\d+ \[/g, ":N [").trim();
var SEP = "\u241F";
var identityKey = (f) => [f.ruleId, f.file, stablePath(f.jsonPath), f.subject ?? "", normEvidence(f.evidence)].join(SEP);
var looseKey = (f) => [f.ruleId, f.file, stablePath(f.jsonPath), f.subject ?? ""].join(SEP);
var identityHash = (f) => createHash("sha256").update(identityKey(f)).digest("hex").slice(0, 32);

// ../core/src/baseline.ts
var BASELINE_FILE = `.${PRODUCT.id}-baseline.json`;
var BaselineError = class extends Error {
};
function createBaseline(findings) {
  const byId = /* @__PURE__ */ new Map();
  for (const f of findings) {
    const id = identityHash(f);
    const e = byId.get(id);
    if (e) e.count++;
    else byId.set(id, { id, count: 1, ruleId: f.ruleId, file: f.file, title: f.title });
  }
  const entries = [...byId.values()].sort((a, b) => a.file.localeCompare(b.file) || a.ruleId.localeCompare(b.ruleId) || a.id.localeCompare(b.id));
  return { version: 1, tool: PRODUCT.name, findings: entries };
}
function serializeBaseline(b) {
  return JSON.stringify(b, null, 2) + "\n";
}
function parseBaseline(text2) {
  let raw;
  try {
    raw = JSON.parse(text2);
  } catch (e) {
    throw new BaselineError(`baseline is not valid JSON: ${e.message}`);
  }
  if (!raw || typeof raw !== "object" || raw.version !== 1) throw new BaselineError("baseline has an unsupported or missing version (expected 1)");
  const list = raw.findings;
  if (!Array.isArray(list)) throw new BaselineError("baseline has no findings array");
  const findings = [];
  for (const e of list) {
    if (!e || typeof e !== "object") throw new BaselineError("baseline entry is not an object");
    const o = e;
    if (typeof o.id !== "string" || !/^[0-9a-f]{32}$/.test(o.id)) throw new BaselineError("baseline entry has an invalid id");
    const count = o.count === void 0 ? 1 : o.count;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1) throw new BaselineError("baseline entry has an invalid count");
    findings.push({ id: o.id, count, ruleId: String(o.ruleId ?? ""), file: String(o.file ?? ""), title: String(o.title ?? "") });
  }
  return { version: 1, tool: String(raw.tool ?? PRODUCT.name), findings };
}
function applyBaseline(findings, baseline) {
  const remaining = /* @__PURE__ */ new Map();
  for (const e of baseline.findings) remaining.set(e.id, (remaining.get(e.id) ?? 0) + e.count);
  const kept = [];
  const suppressed = [];
  for (const f of findings) {
    const id = identityHash(f);
    const n = remaining.get(id) ?? 0;
    if (n > 0) {
      remaining.set(id, n - 1);
      suppressed.push(f);
    } else kept.push(f);
  }
  let stale = 0;
  for (const n of remaining.values()) stale += n;
  return { kept, suppressed, stale };
}

// ../core/src/lock/lock.ts
import { createHash as createHash2 } from "node:crypto";
var LOCK_FILE = PRODUCT.lockFile;
var LockError = class extends Error {
};
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (isObj(v)) {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = canonical(v[k]);
    return o;
  }
  return v;
}
var hashOf = (v) => createHash2("sha256").update(JSON.stringify(canonical(v))).digest("hex");
function scrub(text2) {
  let t = text2;
  for (const p of SECRET_PATTERNS) t = t.replace(new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : p.re.flags + "g"), "\u2039redacted\u203A");
  return t;
}
function scrubArgs(args) {
  const out = [];
  let hideNext = false;
  for (const a of args) {
    if (hideNext) {
      out.push("\u2039redacted\u203A");
      hideNext = false;
      continue;
    }
    const m = /^(--?[\w-]+)=(.+)$/.exec(a);
    if (m && SECRET_KEY_NAME.test(m[1])) {
      out.push(`${m[1]}=\u2039redacted\u203A`);
      continue;
    }
    if (/^--?[\w-]+$/.test(a) && SECRET_KEY_NAME.test(a)) {
      out.push(a);
      hideNext = true;
      continue;
    }
    out.push(a);
  }
  return out;
}
var names = (v) => isObj(v) ? Object.keys(v).sort() : [];
function mcpSummary(def) {
  const parts = [];
  if (isStr(def.command)) parts.push(scrub([def.command, ...scrubArgs(Array.isArray(def.args) ? def.args.filter(isStr) : [])].join(" ")));
  if (isStr(def.url)) parts.push(scrub(def.url));
  if (isStr(def.type) && !isStr(def.url) && !isStr(def.command)) parts.push(`type ${def.type}`);
  const env = names(def.env);
  const headers = names(def.headers);
  if (env.length) parts.push(`[env: ${env.join(",")}]`);
  if (headers.length) parts.push(`[headers: ${headers.join(",")}]`);
  return clip(parts.join(" ") || "(empty definition)", 200);
}
function hookSummary(event, matcher, h) {
  const what = isStr(h.url) ? `http ${scrub(h.url)}` : [isStr(h.command) ? h.command : "", ...Array.isArray(h.args) ? scrubArgs(h.args.filter(isStr)) : []].join(" ").trim();
  return clip(`${event}${isStr(matcher) && matcher ? ` [${matcher}]` : ""}: ${scrub(what) || "(no command)"}`, 200);
}
function collect(files) {
  const out = [];
  for (const file of files) {
    if (file.parseError) continue;
    if (MCP_KINDS.includes(file.kind)) {
      for (const s of mcpServers(file)) {
        out.push({ kind: "mcp-server", file: file.path, key: s.path.join("."), sha256: hashOf(s.def), summary: mcpSummary(s.def), group: `mcp:${s.path.join(".")}`, path: s.path, source: file });
      }
    }
    if (SETTINGS_KINDS.includes(file.kind) && isObj(file.parsed) && isObj(file.parsed.hooks)) {
      for (const [event, groups] of Object.entries(file.parsed.hooks)) {
        if (!Array.isArray(groups)) continue;
        groups.forEach((g, gi) => {
          if (!isObj(g) || !Array.isArray(g.hooks)) return;
          g.hooks.forEach((h, hi) => {
            if (!isObj(h)) return;
            const path = ["hooks", event, gi, "hooks", hi];
            out.push({
              kind: "hook",
              file: file.path,
              key: path.join("."),
              group: `hook:${event}`,
              path,
              source: file,
              sha256: hashOf({ event, matcher: g.matcher ?? null, hook: h }),
              summary: hookSummary(event, g.matcher, h)
            });
          });
        });
      }
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.key.localeCompare(b.key));
}
function collectLockEntries(files) {
  return collect(files).map(({ kind, file, key, sha256, summary }) => ({ kind, file, key, sha256, summary }));
}
var createLock = (files) => ({ version: 1, tool: PRODUCT.name, entries: collectLockEntries(files) });
var serializeLock = (l) => JSON.stringify(l, null, 2) + "\n";
function parseLock(text2) {
  let raw;
  try {
    raw = JSON.parse(text2);
  } catch (e) {
    throw new LockError(`lock is not valid JSON: ${e.message}`);
  }
  if (!isObj(raw) || raw.version !== 1) throw new LockError("lock has an unsupported or missing version (expected 1)");
  if (!Array.isArray(raw.entries)) throw new LockError("lock has no entries array");
  const entries = [];
  for (const e of raw.entries) {
    if (!isObj(e) || e.kind !== "mcp-server" && e.kind !== "hook" || !isStr(e.file) || !isStr(e.key) || !isStr(e.sha256) || !/^[0-9a-f]{64}$/.test(e.sha256)) throw new LockError("lock has an invalid entry");
    entries.push({ kind: e.kind, file: e.file, key: e.key, sha256: e.sha256, summary: isStr(e.summary) ? e.summary : "" });
  }
  return { version: 1, tool: isStr(raw.tool) ? raw.tool : PRODUCT.name, entries };
}
var M012 = { id: "AG-012", references: ["https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices"] };
function verifyLock(lock, files) {
  const current = collect(files);
  const used = /* @__PURE__ */ new Set();
  const drift = [];
  const free = new Set(current);
  let locked = [...lock.entries];
  const take = (pred) => {
    locked = locked.filter((l) => {
      for (const c of free) if (c.kind === l.kind && c.sha256 === l.sha256 && pred(l, c)) {
        free.delete(c);
        used.add(c);
        return false;
      }
      return true;
    });
  };
  take((l, c) => c.file === l.file && c.key === l.key);
  take(() => true);
  locked = locked.filter((l) => {
    for (const c of free) if (c.kind === l.kind && c.file === l.file && c.key === l.key) {
      free.delete(c);
      used.add(c);
      drift.push({ type: "changed", before: l, after: c });
      return false;
    }
    return true;
  });
  const stillLocked = locked;
  const freeCurrent = [...free];
  const groupOf = (l) => l.kind === "mcp-server" ? `mcp:${l.key}` : `hook:${l.key.split(".")[1] ?? ""}`;
  const lockedByGroup = /* @__PURE__ */ new Map();
  for (const l of stillLocked) {
    const k = `${l.file}|${groupOf(l)}`;
    (lockedByGroup.get(k) ?? lockedByGroup.set(k, []).get(k)).push(l);
  }
  const freeByGroup = /* @__PURE__ */ new Map();
  for (const c of freeCurrent) {
    const k = `${c.file}|${c.group}`;
    (freeByGroup.get(k) ?? freeByGroup.set(k, []).get(k)).push(c);
  }
  const pairedLocked = /* @__PURE__ */ new Set();
  const pairedCurrent = /* @__PURE__ */ new Set();
  for (const [k, ls] of lockedByGroup) {
    const cs = freeByGroup.get(k);
    if (ls.length === 1 && cs?.length === 1) {
      drift.push({ type: "changed", before: ls[0], after: cs[0] });
      pairedLocked.add(ls[0]);
      pairedCurrent.add(cs[0]);
    }
  }
  for (const l of stillLocked) if (!pairedLocked.has(l)) drift.push({ type: "removed", before: l });
  for (const c of freeCurrent) if (!pairedCurrent.has(c)) drift.push({ type: "added", after: c });
  const counts = { changed: 0, added: 0, removed: 0 };
  const findings = [];
  for (const d of drift) {
    counts[d.type]++;
    findings.push(driftFinding(d, current));
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || (a.jsonPath ?? "").localeCompare(b.jsonPath ?? ""));
  for (const f of findings) redactFindingText(f);
  return { drift, findings, counts, entries: lock.entries.length };
}
function driftFinding(d, current) {
  const e = d.after ?? d.before;
  const what = e.kind === "mcp-server" ? `MCP server "${e.key.split(".").slice(1).join(".")}"` : `${e.key.split(".")[1] ?? ""} hook`;
  const loc = d.after ? current.find((c) => c.kind === d.after.kind && c.file === d.after.file && c.key === d.after.key) : void 0;
  const range = (loc ? loc.source.locate(loc.path) : void 0) ?? ZERO_RANGE;
  const sameSummary = d.before && d.after && d.before.summary === d.after.summary;
  const evidence = d.type === "changed" ? `before: ${d.before.summary} | after: ${d.after.summary}${sameSummary ? " (summary identical: env/header values or other fields changed)" : ""}` : d.type === "added" ? `after: ${d.after.summary}` : `before: ${d.before.summary}`;
  const base = {
    ruleId: M012.id,
    category: "supply-chain",
    file: e.file,
    range,
    evidence,
    jsonPath: (d.after ?? d.before).key,
    subject: d.type,
    references: M012.references
  };
  if (d.type === "changed") return {
    ...base,
    severity: "high",
    confidence: "high",
    title: `${what} changed since it was locked`,
    whyItMatters: "The definition differs from the one that was reviewed and locked. A changed launch command, package version, URL or hook command is how a previously accepted entry turns malicious (rug-pull class).",
    fix: `Review the change. If it is intended, re-run \`${PRODUCT.id} lock\` to accept it; otherwise revert it.`
  };
  if (d.type === "added") return {
    ...base,
    severity: "medium",
    confidence: "high",
    title: `${what} was added after the lock`,
    whyItMatters: "This entry did not exist when the lock was written, so nobody has reviewed it against the lock.",
    fix: `Review it. If it is intended, re-run \`${PRODUCT.id} lock\` to accept it.`
  };
  return {
    ...base,
    severity: "low",
    confidence: "high",
    title: `${what} in the lock no longer exists`,
    whyItMatters: "A locked entry disappeared. That is usually intended cleanup, but it can also mean a configuration was replaced by a differently named one.",
    fix: `If the removal is intended, re-run \`${PRODUCT.id} lock\` to update the lock.`
  };
}

// ../core/src/diff/lines.ts
var norm3 = (s) => s.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
function lineSimilarity(a, b) {
  if (a === b) return 1;
  const A = norm3(a), B = norm3(b);
  if (!A.length && !B.length) return 1;
  if (!A.length || !B.length) return 0;
  const counts = /* @__PURE__ */ new Map();
  for (const l of A) counts.set(l, (counts.get(l) ?? 0) + 1);
  let common = 0;
  for (const l of B) {
    const n = counts.get(l) ?? 0;
    if (n > 0) {
      common++;
      counts.set(l, n - 1);
    }
  }
  return 2 * common / (A.length + B.length);
}
function addedLineIndexes(base, head) {
  const out = /* @__PURE__ */ new Set();
  const lines = head.replace(/\r\n/g, "\n").split("\n");
  if (base === void 0) {
    lines.forEach((_l, i) => out.add(i));
    return out;
  }
  const counts = /* @__PURE__ */ new Map();
  for (const l of base.replace(/\r\n/g, "\n").split("\n")) {
    const t = l.trim();
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  lines.forEach((l, i) => {
    const t = l.trim();
    const n = counts.get(t) ?? 0;
    if (n > 0 && t !== "") counts.set(t, n - 1);
    else if (t !== "") out.add(i);
  });
  return out;
}
function withContext(indexes, context, max) {
  const out = /* @__PURE__ */ new Set();
  for (const i of indexes) for (let d = -context; d <= context; d++) {
    const j2 = i + d;
    if (j2 >= 0 && j2 < max) out.add(j2);
  }
  return out;
}

// ../core/src/diff/semantic.ts
var SETTINGS = /* @__PURE__ */ new Set(["claude-settings", "claude-local-settings"]);
var MCP = /* @__PURE__ */ new Set(["mcp-json", "cursor-mcp", "vscode-mcp", "gemini-settings", "codex-config", "claude-desktop-config"]);
var INSTRUCTION = /* @__PURE__ */ new Set(["instruction-md", "cursor-rule", "copilot-instructions", "windsurf-rules", "cline-rules", "skill-md"]);
function shown(key, v) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (SECRET_KEY_NAME.test(key)) return "\u2039hidden\u203A";
  for (const p of SECRET_PATTERNS) {
    p.re.lastIndex = 0;
    if (p.re.test(s)) return "\u2039hidden\u203A";
  }
  return s.length > 100 ? s.slice(0, 97) + "\u2026" : s;
}
function coversEntry(wide, narrow) {
  if (wide === narrow) return false;
  const parse4 = (e) => /^\s*([A-Za-z_][\w:.-]*)\s*(?:\(([\s\S]*)\))?\s*$/.exec(e);
  const w = parse4(wide), n = parse4(narrow);
  if (!w || !n || w[1] !== n[1]) return false;
  const ws = (w[2] ?? "*").trim(), ns = (n[2] ?? "*").trim();
  if (ws === "" || ws === "*" || ws === "**" || ws === ":*") return ns !== ws;
  const m = /^(.*?)(?::\*|\s*\*+)$/.exec(ws);
  return !!m && ns.startsWith(m[1].trimEnd()) && ns !== ws;
}
var arr = (v) => Array.isArray(v) ? v.filter(isStr) : [];
function settingsChanges(b, h, out) {
  const bp = isObj(b?.parsed) ? b.parsed : {};
  const hp = isObj(h.parsed) ? h.parsed : {};
  const bPerm = isObj(bp.permissions) ? bp.permissions : {};
  const hPerm = isObj(hp.permissions) ? hp.permissions : {};
  const bAllow = new Set(arr(bPerm.allow)), hAllow = arr(hPerm.allow);
  const removedAllow = [...bAllow].filter((e) => !hAllow.includes(e));
  const addedAllow = hAllow.filter((e) => !bAllow.has(e));
  for (const e of addedAllow) {
    const covers = removedAllow.find((r) => coversEntry(e, r));
    const cls = classifyAllow(e);
    if (covers) out.push({ kind: "permission-widened", file: h.path, subject: e, detail: `permission widened: ${covers} \u2192 ${e}`, before: covers, after: e, riskier: true });
    else out.push({ kind: "permission-added", file: h.path, subject: e, detail: `permission added: ${e}`, after: e, riskier: !!cls && sevRank(cls.sev) >= sevRank("medium") });
  }
  for (const e of removedAllow) if (!addedAllow.some((a) => coversEntry(a, e))) out.push({ kind: "permission-removed", file: h.path, subject: e, detail: `permission removed: ${e}`, before: e, riskier: false });
  const hDeny = new Set(arr(hPerm.deny));
  for (const d of arr(bPerm.deny)) if (!hDeny.has(d)) out.push({ kind: "deny-removed", file: h.path, subject: d, detail: `deny rule removed: ${d}`, before: d, riskier: true });
  if (bPerm.defaultMode !== hPerm.defaultMode && hPerm.defaultMode !== void 0) {
    const risky = ["bypassPermissions", "auto", "dontAsk"].includes(String(hPerm.defaultMode));
    out.push({ kind: "default-mode-changed", file: h.path, subject: "permissions.defaultMode", detail: `defaultMode ${bPerm.defaultMode === void 0 ? "(unset)" : String(bPerm.defaultMode)} \u2192 ${String(hPerm.defaultMode)}`, before: String(bPerm.defaultMode ?? ""), after: String(hPerm.defaultMode), riskier: risky });
  }
  const bEnv = isObj(bp.env) ? bp.env : {}, hEnv = isObj(hp.env) ? hp.env : {};
  for (const [k, v] of Object.entries(hEnv)) {
    if (!(k in bEnv)) out.push({ kind: "env-added", file: h.path, subject: k, detail: `env ${k} added: ${shown(k, v)}`, after: shown(k, v), riskier: true });
    else if (bEnv[k] !== v) out.push({ kind: "env-changed", file: h.path, subject: k, detail: `env ${k} changed: ${shown(k, bEnv[k])} \u2192 ${shown(k, v)}`, before: shown(k, bEnv[k]), after: shown(k, v), riskier: true });
  }
  for (const k of Object.keys(bEnv)) if (!(k in hEnv)) out.push({ kind: "env-removed", file: h.path, subject: k, detail: `env ${k} removed`, riskier: false });
  const bCmds = settingsCommands(bp), hCmds = settingsCommands(hp);
  const key = (c) => `${c.origin}\u241F${c.command}`;
  const bKeys = /* @__PURE__ */ new Map(), hKeys = /* @__PURE__ */ new Map();
  for (const c of bCmds) bKeys.set(key(c), (bKeys.get(key(c)) ?? 0) + 1);
  for (const c of hCmds) hKeys.set(key(c), (hKeys.get(key(c)) ?? 0) + 1);
  const addedC = hCmds.filter((c) => {
    const n = bKeys.get(key(c)) ?? 0;
    if (n > 0) {
      bKeys.set(key(c), n - 1);
      return false;
    }
    return true;
  });
  const removedC = bCmds.filter((c) => {
    const n = hKeys.get(key(c)) ?? 0;
    if (n > 0) {
      hKeys.set(key(c), n - 1);
      return false;
    }
    return true;
  });
  const usedRemoved = /* @__PURE__ */ new Set();
  for (const a of addedC) {
    const ri = removedC.findIndex((r, i) => !usedRemoved.has(i) && r.origin === a.origin);
    if (ri >= 0) {
      usedRemoved.add(ri);
      out.push({ kind: "hook-changed", file: h.path, subject: a.origin, detail: `${a.origin} command changed`, before: removedC[ri].command, after: a.command, riskier: true });
    } else out.push({ kind: "hook-added", file: h.path, subject: a.origin, detail: `${a.origin} added`, after: a.command, riskier: true });
  }
  removedC.forEach((r, i) => {
    if (!usedRemoved.has(i)) out.push({ kind: "hook-removed", file: h.path, subject: r.origin, detail: `${r.origin} removed`, before: r.command, riskier: false });
  });
  if (hp.enableAllProjectMcpServers === true && bp.enableAllProjectMcpServers !== true)
    out.push({ kind: "mcp-approval-changed", file: h.path, subject: "enableAllProjectMcpServers", detail: "enableAllProjectMcpServers turned on: the repository now approves every server it ships", before: String(bp.enableAllProjectMcpServers ?? ""), after: "true", riskier: true });
  const bEn = new Set(arr(bp.enabledMcpjsonServers));
  for (const n of arr(hp.enabledMcpjsonServers)) if (!bEn.has(n)) out.push({ kind: "mcp-approval-changed", file: h.path, subject: n, detail: `MCP server "${n}" pre-approved`, after: n, riskier: true });
}
function launchLine(def) {
  const l = effectiveLaunch(def);
  return l ? [l.cmd, ...l.args].join(" ") : isStr(def.url) ? def.url : "";
}
function mcpChanges(b, h, out) {
  const bs = new Map(b ? mcpServers(b).map((s) => [s.name, s.def]) : []);
  const hs = new Map(mcpServers(h).map((s) => [s.name, s.def]));
  for (const [name, def] of hs) {
    const old = bs.get(name);
    if (!old) {
      out.push({ kind: "mcp-server-added", file: h.path, subject: name, detail: `MCP server "${name}" added: ${launchLine(def)}`, after: launchLine(def), riskier: true });
      continue;
    }
    const diffs = [];
    if (launchLine(old) !== launchLine(def)) diffs.push(`launch ${launchLine(old) || "(none)"} \u2192 ${launchLine(def) || "(none)"}`);
    const oe = isObj(old.env) ? old.env : {}, ne = isObj(def.env) ? def.env : {};
    for (const k of /* @__PURE__ */ new Set([...Object.keys(oe), ...Object.keys(ne)])) if (JSON.stringify(oe[k]) !== JSON.stringify(ne[k])) diffs.push(`env ${k}: ${k in oe ? shown(k, oe[k]) : "(unset)"} \u2192 ${k in ne ? shown(k, ne[k]) : "(unset)"}`);
    const oh = isObj(old.headers) ? old.headers : {}, nh = isObj(def.headers) ? def.headers : {};
    for (const k of /* @__PURE__ */ new Set([...Object.keys(oh), ...Object.keys(nh)])) if (JSON.stringify(oh[k]) !== JSON.stringify(nh[k])) diffs.push(`header ${k} changed`);
    if (strArgs(old).join("\0") !== strArgs(def).join("\0") && !diffs.some((d) => d.startsWith("launch"))) diffs.push("args changed");
    if (diffs.length) out.push({ kind: "mcp-server-changed", file: h.path, subject: name, detail: `MCP server "${name}" changed: ${diffs.join("; ")}`, before: launchLine(old), after: launchLine(def), riskier: true });
  }
  for (const name of bs.keys()) if (!hs.has(name)) out.push({ kind: "mcp-server-removed", file: h.path, subject: name, detail: `MCP server "${name}" removed`, riskier: false });
}
function taskChanges(b, h, out) {
  const bt = new Map((b ? tasksCommands(b.parsed) : []).map((t) => [t.label, t]));
  const ht = tasksCommands(h.parsed);
  const seen = /* @__PURE__ */ new Set();
  for (const t of ht) {
    if (seen.has(t.label)) continue;
    seen.add(t.label);
    const old = bt.get(t.label);
    if (!old) out.push({ kind: "task-added", file: h.path, subject: t.label, detail: `task "${t.label}" added${t.runOnOpen ? " (runs on folder open)" : ""}: ${t.command}`, after: t.command, riskier: t.runOnOpen });
    else if (old.command !== t.command || old.runOnOpen !== t.runOnOpen)
      out.push({ kind: "task-changed", file: h.path, subject: t.label, detail: `task "${t.label}" changed${t.runOnOpen && !old.runOnOpen ? " (now runs on folder open)" : ""}`, before: old.command, after: t.command, riskier: t.runOnOpen });
  }
  for (const label of bt.keys()) if (!seen.has(label)) out.push({ kind: "task-removed", file: h.path, subject: label, detail: `task "${label}" removed`, riskier: false });
}
function semanticChanges(input) {
  const out = [];
  const baseByPath = new Map(input.base.files.map((f) => [f.path, f]));
  const headPaths = new Set(input.head.files.map((f) => f.path));
  const renamedFrom = new Set(input.renames.values());
  for (const h of input.head.files) {
    const from = input.renames.get(h.path);
    const b = baseByPath.get(from ?? h.path);
    if (!b) {
      out.push({ kind: "file-added", file: h.path, subject: h.path, detail: `${h.kind} file added`, riskier: SETTINGS.has(h.kind) || MCP.has(h.kind) || h.kind === "vscode-tasks" || INSTRUCTION.has(h.kind) });
    } else if (from && from !== h.path) {
      out.push({ kind: "file-renamed", file: h.path, subject: from, detail: `renamed from ${from}`, before: from, after: h.path, riskier: false });
    }
    if (SETTINGS.has(h.kind)) settingsChanges(b, h, out);
    else if (MCP.has(h.kind)) mcpChanges(b, h, out);
    else if (h.kind === "vscode-tasks") taskChanges(b, h, out);
    if (h.kind === "claude-local-settings" && input.head.tracked?.has(h.path) && input.base.tracked && !input.base.tracked.has(from ?? h.path))
      out.push({ kind: "local-settings-tracked", file: h.path, subject: h.path, detail: `${h.path} is now committed to git`, riskier: true });
  }
  for (const b of input.base.files) if (!headPaths.has(b.path) && !renamedFrom.has(b.path)) out.push({ kind: "file-removed", file: b.path, subject: b.path, detail: `${b.kind} file removed`, riskier: false });
  return out;
}

// ../core/src/diff/diff.ts
var redactChange = (c) => ({ ...c, subject: redactSecretsInText(c.subject), detail: redactSecretsInText(c.detail), ...c.before !== void 0 ? { before: redactSecretsInText(c.before) } : {}, ...c.after !== void 0 ? { after: redactSecretsInText(c.after) } : {} });
var confRank2 = { high: 2, medium: 1, low: 0 };
var WINDOWED_RULES = /* @__PURE__ */ new Set(["AG-021", "AG-022", "AG-023", "AG-008"]);
var INSTRUCTION2 = new Set(INSTRUCTION_KINDS);
function diffStates(base, head, opts = {}) {
  const contextLines = opts.contextLines ?? 3;
  const threshold = opts.renameThreshold ?? 0.8;
  const basePaths = new Set(base.files.map((f) => f.path));
  const headPaths = new Set(head.files.map((f) => f.path));
  const baseOnly = base.files.filter((f) => !headPaths.has(f.path));
  const used = /* @__PURE__ */ new Set();
  const renames = [];
  for (const h of head.files.filter((f) => !basePaths.has(f.path))) {
    let best;
    for (const b of baseOnly) {
      if (used.has(b.path) || b.kind !== h.kind) continue;
      const sim = lineSimilarity(b.text, h.text);
      if (sim >= threshold && (!best || sim > best.sim)) best = { b, sim };
    }
    if (best) {
      used.add(best.b.path);
      renames.push({ from: best.b.path, to: h.path, similarity: best.sim });
    }
  }
  const headToBase = new Map(renames.map((r) => [r.to, r.from]));
  const baseToHead = new Map(renames.map((r) => [r.from, r.to]));
  const scanState = (s) => scanFiles(s.files, { config: opts.config, trackedFiles: s.tracked, readFile: s.readFile }).findings;
  const baseFindings = scanState(base);
  const headFindings = scanState(head);
  const asHead = (f) => baseToHead.has(f.file) ? { ...f, file: baseToHead.get(f.file) } : f;
  const headByKey = /* @__PURE__ */ new Map();
  for (const f of headFindings) {
    const k = identityKey(f);
    (headByKey.get(k) ?? headByKey.set(k, []).get(k)).push(f);
  }
  const unchanged = [];
  const unmatchedBase = [];
  for (const b of baseFindings) {
    const list = headByKey.get(identityKey(asHead(b)));
    if (list?.length) unchanged.push(list.shift());
    else unmatchedBase.push(b);
  }
  const unmatchedHead = [...headByKey.values()].flat();
  const worsened = [];
  const improved = [];
  const baseLoose = /* @__PURE__ */ new Map(), headLoose = /* @__PURE__ */ new Map();
  for (const b of unmatchedBase) {
    const k = looseKey(asHead(b));
    (baseLoose.get(k) ?? baseLoose.set(k, []).get(k)).push(b);
  }
  for (const h of unmatchedHead) {
    const k = looseKey(h);
    (headLoose.get(k) ?? headLoose.set(k, []).get(k)).push(h);
  }
  const pairedBase = /* @__PURE__ */ new Set(), pairedHead = /* @__PURE__ */ new Set();
  for (const [k, bs] of baseLoose) {
    const hs = headLoose.get(k);
    if (bs.length !== 1 || hs?.length !== 1) continue;
    const b = bs[0], h = hs[0];
    pairedBase.add(b);
    pairedHead.add(h);
    const sevUp = sevRank(h.severity) > sevRank(b.severity);
    const confUp = sevRank(h.severity) === sevRank(b.severity) && confRank2[h.confidence] > confRank2[b.confidence];
    if (sevUp || confUp) worsened.push({ base: b, head: { ...h, introducedByChange: true }, reason: sevUp ? `severity ${b.severity} \u2192 ${h.severity}` : `confidence ${b.confidence} \u2192 ${h.confidence}` });
    else {
      const sevDown = sevRank(h.severity) < sevRank(b.severity);
      const confDown = sevRank(h.severity) === sevRank(b.severity) && confRank2[h.confidence] < confRank2[b.confidence];
      if (sevDown || confDown) improved.push({ base: b, head: h, reason: sevDown ? `severity ${b.severity} \u2192 ${h.severity}` : `confidence ${b.confidence} \u2192 ${h.confidence}` });
      unchanged.push(h);
    }
  }
  const headByPath = new Map(head.files.map((f) => [f.path, f]));
  const baseByPath = new Map(base.files.map((f) => [f.path, f]));
  const introduced = [];
  for (const h of unmatchedHead.filter((x) => !pairedHead.has(x))) {
    const hf = headByPath.get(h.file);
    const baseCounterpart = baseByPath.get(headToBase.get(h.file) ?? h.file);
    if (hf && baseCounterpart && INSTRUCTION2.has(hf.kind) && WINDOWED_RULES.has(h.ruleId)) {
      const lines = hf.text.split("\n").length;
      const window = withContext(addedLineIndexes(baseCounterpart.text, hf.text), contextLines, lines);
      let touches2 = false;
      for (let l = h.range.startLine; l <= h.range.endLine; l++) if (window.has(l)) {
        touches2 = true;
        break;
      }
      if (!touches2) {
        unchanged.push(h);
        continue;
      }
    }
    introduced.push({ ...h, introducedByChange: true });
  }
  const resolved = unmatchedBase.filter((b) => !pairedBase.has(b));
  const changes = semanticChanges({ base: { files: base.files, tracked: base.tracked }, head: { files: head.files, tracked: head.tracked }, renames: headToBase }).map(redactChange);
  return {
    base: base.label,
    head: head.label,
    introduced,
    worsened,
    improved,
    resolved,
    unchanged,
    renames,
    changes,
    stats: {
      baseFindings: baseFindings.length,
      headFindings: headFindings.length,
      introduced: introduced.length,
      worsened: worsened.length,
      improved: improved.length,
      resolved: resolved.length,
      unchanged: unchanged.length,
      riskierChanges: changes.filter((c) => c.riskier).length
    }
  };
}
var changedFindings = (d) => [...d.introduced, ...d.worsened.map((p) => p.head)];

// ../core/src/git/repo.ts
import { closeSync, existsSync as existsSync3, fstatSync, lstatSync as lstatSync4, openSync, readFileSync as readFileSync5, readSync, readdirSync as readdirSync2 } from "node:fs";
import { dirname, isAbsolute, join as join4, resolve as resolve2 } from "node:path";
import { inflateSync } from "node:zlib";
var GitError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "GitError";
  }
};
var MAX_OBJECT_BYTES = 64 * 1024 * 1024;
var MAX_DELTA_DEPTH = 300;
var MAX_TREE_ENTRIES = 5e5;
var HEX40 = /^[0-9a-f]{40}$/;
var TYPES = { 1: "commit", 2: "tree", 3: "blob", 4: "tag" };
function parseIdx(idx) {
  if (idx.length < 8 + 1024 || idx.readUInt32BE(0) !== 4285812579 || idx.readUInt32BE(4) !== 2) throw new GitError("unsupported", "only pack index version 2 is supported");
  const fanout = new Uint32Array(256);
  for (let i = 0; i < 256; i++) fanout[i] = idx.readUInt32BE(8 + i * 4);
  const n = fanout[255];
  const shaStart = 8 + 1024;
  const crcStart = shaStart + n * 20;
  const off32Start = crcStart + n * 4;
  const off64Start = off32Start + n * 4;
  if (off64Start > idx.length) throw new GitError("corrupt", "truncated pack index");
  return { idx, n, fanout, shaStart, off32Start, off64Start };
}
function lowerBound(p, target, len) {
  const first = target[0];
  let lo = first === 0 ? 0 : p.fanout[first - 1];
  let hi = p.fanout[first];
  while (lo < hi) {
    const mid = lo + hi >>> 1;
    const c = p.idx.compare(target, 0, len, p.shaStart + mid * 20, p.shaStart + mid * 20 + len);
    if (c < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function packOffset(p, i) {
  const o = p.idx.readUInt32BE(p.off32Start + i * 4);
  if (o & 2147483648) {
    const big = p.idx.readBigUInt64BE(p.off64Start + (o & 2147483647) * 8);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new GitError("limit", "pack offset too large");
    return Number(big);
  }
  return o;
}
function readVarint(buf, pos) {
  let result = 0, shift = 0, b;
  do {
    if (pos.i >= buf.length) throw new GitError("corrupt", "truncated delta");
    b = buf[pos.i++];
    result += (b & 127) * 2 ** shift;
    shift += 7;
    if (shift > 56) throw new GitError("corrupt", "bad varint");
  } while (b & 128);
  return result;
}
function applyDelta(base, delta) {
  const pos = { i: 0 };
  const srcSize = readVarint(delta, pos);
  const dstSize = readVarint(delta, pos);
  if (srcSize !== base.length) throw new GitError("corrupt", "delta base size mismatch");
  if (dstSize > MAX_OBJECT_BYTES) throw new GitError("limit", "object too large");
  const out = Buffer.allocUnsafe(dstSize);
  let o = 0;
  while (pos.i < delta.length) {
    const cmd = delta[pos.i++];
    if (cmd & 128) {
      let off = 0, size = 0;
      for (let k = 0; k < 4; k++) if (cmd & 1 << k) off |= delta[pos.i++] << 8 * k;
      for (let k = 0; k < 3; k++) if (cmd & 16 << k) size |= delta[pos.i++] << 8 * k;
      off >>>= 0;
      if (size === 0) size = 65536;
      if (off + size > base.length || o + size > dstSize) throw new GitError("corrupt", "delta copy out of range");
      base.copy(out, o, off, off + size);
      o += size;
    } else if (cmd) {
      if (pos.i + cmd > delta.length || o + cmd > dstSize) throw new GitError("corrupt", "delta insert out of range");
      delta.copy(out, o, pos.i, pos.i + cmd);
      pos.i += cmd;
      o += cmd;
    } else throw new GitError("corrupt", "delta command 0");
  }
  if (o !== dstSize) throw new GitError("corrupt", "delta result size mismatch");
  return out;
}
var COMMIT_LINE_MAX = 4096;
var AUTHOR_MAX = 200;
var SUBJECT_MAX = 1e3;
var GitRepo = class _GitRepo {
  gitDir;
  commonDir;
  objectDirs;
  packs;
  cache = /* @__PURE__ */ new Map();
  cacheBytes = 0;
  constructor(gitDir, commonDir, objectDirs) {
    this.gitDir = gitDir;
    this.commonDir = commonDir;
    this.objectDirs = objectDirs;
  }
  /** Open the repository whose working tree is `root`. Throws GitError("not-a-repo") if there is none. */
  static open(root) {
    const dotGit = join4(root, ".git");
    let st;
    try {
      st = lstatSync4(dotGit);
    } catch {
      throw new GitError("not-a-repo", `${root} is not a git working tree`);
    }
    let gitDir;
    if (st.isDirectory()) gitDir = dotGit;
    else if (st.isFile()) {
      const m = /^gitdir:\s*(.+)\s*$/m.exec(readFileSync5(dotGit, "utf8"));
      if (!m) throw new GitError("not-a-repo", ".git file has no gitdir line");
      gitDir = isAbsolute(m[1]) ? m[1] : resolve2(root, m[1]);
    } else throw new GitError("unsupported", ".git is a symlink or special file");
    return _GitRepo.openGitDir(gitDir);
  }
  /** Open a bare repository or a .git directory directly. */
  static openGitDir(gitDir) {
    if (!existsSync3(join4(gitDir, "HEAD"))) throw new GitError("not-a-repo", `${gitDir} has no HEAD`);
    let commonDir = gitDir;
    const cd = join4(gitDir, "commondir");
    if (existsSync3(cd)) {
      const t = readFileSync5(cd, "utf8").trim();
      commonDir = isAbsolute(t) ? t : resolve2(gitDir, t);
    }
    const objects = join4(commonDir, "objects");
    const dirs = [objects];
    const alt = join4(objects, "info", "alternates");
    if (existsSync3(alt)) {
      for (const l of readFileSync5(alt, "utf8").split(/\r?\n/).slice(0, 8)) {
        const t = l.trim();
        if (t && !t.startsWith("#")) dirs.push(isAbsolute(t) ? t : resolve2(objects, t));
      }
    }
    if (existsSync3(join4(commonDir, "objects", "info", "alternates")) === false && existsSync3(join4(gitDir, "reftable"))) throw new GitError("unsupported", "reftable repositories are not supported");
    return new _GitRepo(gitDir, commonDir, dirs);
  }
  // ------------------------------------------------------------------ objects
  loadPacks() {
    if (this.packs) return this.packs;
    const packs = [];
    for (const od of this.objectDirs) {
      const pd = join4(od, "pack");
      let names2 = [];
      try {
        names2 = readdirSync2(pd);
      } catch {
        continue;
      }
      for (const n of names2.filter((x) => x.endsWith(".idx")).slice(0, 2e3)) {
        try {
          const idx = readFileSync5(join4(pd, n));
          const parsed = parseIdx(idx);
          const packPath = join4(pd, n.replace(/\.idx$/, ".pack"));
          packs.push({ ...parsed, path: packPath, size: 0 });
        } catch (e) {
          if (e instanceof GitError && e.code === "unsupported") throw e;
        }
      }
    }
    return this.packs = packs;
  }
  packFd(p) {
    if (p.fd === void 0) {
      p.fd = openSync(p.path, "r");
      p.size = fstatSync(p.fd).size;
    }
    return p.fd;
  }
  /** Release file descriptors. The repo can still be used afterwards (packs are reopened on demand). */
  close() {
    for (const p of this.packs ?? []) if (p.fd !== void 0) {
      try {
        closeSync(p.fd);
      } catch {
      }
      p.fd = void 0;
    }
    this.cache.clear();
    this.cacheBytes = 0;
  }
  remember(sha, o) {
    if (o.data.length > 4 * 1024 * 1024) return;
    this.cache.set(sha, o);
    this.cacheBytes += o.data.length;
    while (this.cacheBytes > 48 * 1024 * 1024 || this.cache.size > 2e3) {
      const k = this.cache.keys().next().value;
      if (k === void 0) break;
      this.cacheBytes -= this.cache.get(k).data.length;
      this.cache.delete(k);
    }
  }
  readLoose(sha) {
    for (const od of this.objectDirs) {
      const p = join4(od, sha.slice(0, 2), sha.slice(2));
      let raw;
      try {
        raw = readFileSync5(p);
      } catch {
        continue;
      }
      let inflated;
      try {
        inflated = inflateSync(raw, { maxOutputLength: MAX_OBJECT_BYTES + 64 });
      } catch (e) {
        const big = e.code === "ERR_BUFFER_TOO_LARGE" || /maxOutputLength|larger than/i.test(String(e));
        throw new GitError(big ? "limit" : "corrupt", big ? `object ${sha} exceeds the ${MAX_OBJECT_BYTES / (1024 * 1024)} MB size limit` : `cannot inflate loose object ${sha}`);
      }
      const nul = inflated.indexOf(0);
      if (nul < 0) throw new GitError("corrupt", `bad loose object header ${sha}`);
      const m = /^(commit|tree|blob|tag) (\d+)$/.exec(inflated.toString("latin1", 0, nul));
      if (!m) throw new GitError("corrupt", `bad loose object header ${sha}`);
      const data = inflated.subarray(nul + 1);
      if (data.length !== Number(m[2])) throw new GitError("corrupt", `loose object size mismatch ${sha}`);
      return { type: m[1], data };
    }
    return void 0;
  }
  sortedOffsets(p) {
    if (!p.sortedOffsets) {
      const arr2 = new Float64Array(p.n);
      for (let i = 0; i < p.n; i++) arr2[i] = packOffset(p, i);
      arr2.sort();
      p.sortedOffsets = arr2;
    }
    return p.sortedOffsets;
  }
  packEntry(p, offset, depth) {
    if (depth > MAX_DELTA_DEPTH) throw new GitError("limit", "delta chain too deep");
    const fd = this.packFd(p);
    const offs = this.sortedOffsets(p);
    let lo = 0, hi = offs.length;
    while (lo < hi) {
      const mid = lo + hi >>> 1;
      if (offs[mid] <= offset) lo = mid + 1;
      else hi = mid;
    }
    const end = lo < offs.length ? offs[lo] : p.size - 20;
    const len = end - offset;
    if (len <= 0 || len > MAX_OBJECT_BYTES + 1024) throw new GitError("limit", "pack entry out of range");
    const buf = Buffer.allocUnsafe(len);
    if (readSync(fd, buf, 0, len, offset) !== len) throw new GitError("corrupt", "short read from pack");
    const pos = { i: 0 };
    let b = buf[pos.i++];
    const type = b >> 4 & 7;
    let size = b & 15, shift = 4;
    while (b & 128) {
      b = buf[pos.i++];
      size += (b & 127) * 2 ** shift;
      shift += 7;
      if (shift > 56) throw new GitError("corrupt", "bad pack size");
    }
    if (size > MAX_OBJECT_BYTES) throw new GitError("limit", "object too large");
    const inflate = (from) => {
      try {
        return inflateSync(buf.subarray(from), { maxOutputLength: Math.max(size, 1) });
      } catch {
        throw new GitError("corrupt", "cannot inflate pack entry");
      }
    };
    if (type >= 1 && type <= 4) {
      const data = inflate(pos.i);
      if (data.length !== size) throw new GitError("corrupt", "pack entry size mismatch");
      return { type: TYPES[type], data };
    }
    if (type === 6) {
      let c = buf[pos.i++];
      let ofs = c & 127;
      while (c & 128) {
        c = buf[pos.i++];
        ofs = (ofs + 1) * 128 + (c & 127);
      }
      const base = this.packEntry(p, offset - ofs, depth + 1);
      return { type: base.type, data: applyDelta(base.data, inflate(pos.i)) };
    }
    if (type === 7) {
      const baseSha = buf.subarray(pos.i, pos.i + 20).toString("hex");
      pos.i += 20;
      const base = this.readObject(baseSha, depth + 1);
      return { type: base.type, data: applyDelta(base.data, inflate(pos.i)) };
    }
    throw new GitError("corrupt", `unknown pack object type ${type}`);
  }
  /** Read an object by full 40-hex id. Throws GitError("missing-object") if it is not present. */
  readObject(sha, depth = 0) {
    if (!HEX40.test(sha)) throw new GitError("bad-ref", `not an object id: ${sha}`);
    const hit = this.cache.get(sha);
    if (hit) return hit;
    let obj = this.readLoose(sha);
    if (!obj) {
      const raw = Buffer.from(sha, "hex");
      for (const p of this.loadPacks()) {
        const i = lowerBound(p, raw, 20);
        if (i < p.n && p.idx.compare(raw, 0, 20, p.shaStart + i * 20, p.shaStart + i * 20 + 20) === 0) {
          obj = this.packEntry(p, packOffset(p, i), depth);
          break;
        }
      }
    }
    if (!obj) throw new GitError("missing-object", `object ${sha} is not in this repository (shallow or partial clone?)`);
    this.remember(sha, obj);
    return obj;
  }
  hasObject(sha) {
    try {
      this.readObject(sha);
      return true;
    } catch (e) {
      if (e instanceof GitError && e.code === "missing-object") return false;
      throw e;
    }
  }
  /** Expand an abbreviated object id (>= 4 hex chars). Returns undefined if none, throws if ambiguous. */
  expandAbbrev(prefix) {
    if (!/^[0-9a-f]{4,39}$/.test(prefix)) return void 0;
    const found = /* @__PURE__ */ new Set();
    for (const od of this.objectDirs) {
      try {
        for (const n of readdirSync2(join4(od, prefix.slice(0, 2)))) if ((prefix.slice(0, 2) + n).startsWith(prefix)) found.add(prefix.slice(0, 2) + n);
      } catch {
      }
    }
    const even = prefix.length % 2 === 0 ? prefix : prefix.slice(0, -1);
    const raw = Buffer.from(even, "hex");
    for (const p of this.loadPacks()) {
      for (let i = lowerBound(p, raw, raw.length); i < p.n; i++) {
        const sha = p.idx.toString("hex", p.shaStart + i * 20, p.shaStart + i * 20 + 20);
        if (!sha.startsWith(even)) break;
        if (sha.startsWith(prefix)) found.add(sha);
      }
    }
    if (found.size > 1) throw new GitError("bad-ref", `abbreviated id ${prefix} is ambiguous`);
    return [...found][0];
  }
  // ------------------------------------------------------------------ parsed objects
  commit(sha) {
    const o = this.readObject(sha);
    if (o.type !== "commit") throw new GitError("corrupt", `${sha} is a ${o.type}, not a commit`);
    const text2 = o.data.toString("utf8");
    const headEnd = text2.indexOf("\n\n");
    const head = headEnd < 0 ? text2 : text2.slice(0, headEnd);
    let tree = "", time = 0, author = "";
    const parents = [];
    for (const rawLine of head.split("\n")) {
      const line = rawLine.length > COMMIT_LINE_MAX ? rawLine.slice(0, COMMIT_LINE_MAX) : rawLine;
      if (line.startsWith("tree ")) tree = line.slice(5).trim();
      else if (line.startsWith("parent ")) parents.push(line.slice(7).trim());
      else if (line.startsWith("author ")) {
        const lt = line.indexOf("<");
        author = (lt >= 0 ? line.slice(7, lt) : line.slice(7)).trim().slice(0, AUTHOR_MAX);
      } else if (line.startsWith("committer ")) {
        const t = line.trimEnd().split(" ");
        t.pop();
        const ts = t.pop() ?? "";
        if (ts.length <= 15 && /^\d+$/.test(ts)) time = Number(ts);
      }
    }
    if (!HEX40.test(tree)) throw new GitError("corrupt", `commit ${sha} has no tree`);
    const message = headEnd < 0 ? "" : text2.slice(headEnd + 2, headEnd + 2 + SUBJECT_MAX * 4);
    return { sha, tree, parents, time, subject: (message.split("\n")[0] ?? "").slice(0, SUBJECT_MAX), author };
  }
  tree(sha) {
    const o = this.readObject(sha);
    if (o.type !== "tree") throw new GitError("corrupt", `${sha} is a ${o.type}, not a tree`);
    const out = [];
    const d = o.data;
    let i = 0;
    while (i < d.length) {
      const sp = d.indexOf(32, i), nul = d.indexOf(0, sp);
      if (sp < 0 || nul < 0 || nul + 21 > d.length) throw new GitError("corrupt", "bad tree entry");
      out.push({ mode: d.toString("latin1", i, sp), name: d.toString("utf8", sp + 1, nul), sha: d.toString("hex", nul + 1, nul + 21) });
      i = nul + 21;
      if (out.length > MAX_TREE_ENTRIES) throw new GitError("limit", "tree too large");
    }
    return out;
  }
  /** Peel tags until a commit is reached. */
  peelToCommit(sha) {
    let cur = sha;
    for (let i = 0; i < 8; i++) {
      const o = this.readObject(cur);
      if (o.type === "commit") return cur;
      if (o.type !== "tag") throw new GitError("bad-ref", `${sha} does not point at a commit`);
      const m = /^object ([0-9a-f]{40})/m.exec(o.data.toString("utf8"));
      if (!m) throw new GitError("corrupt", "bad tag object");
      cur = m[1];
    }
    throw new GitError("bad-ref", "tag chain too deep");
  }
  // ------------------------------------------------------------------ refs
  safeRefName(name) {
    return name.length > 0 && name.length < 256 && !name.includes("..") && !name.includes("\0") && !name.startsWith("/") && !name.includes("\\") && !/[\s~^:?*[]/.test(name) && !name.endsWith(".lock");
  }
  readRefFile(path, depth = 0) {
    let t;
    try {
      t = readFileSync5(path, "utf8").trim();
    } catch {
      return void 0;
    }
    if (t.startsWith("ref: ")) {
      if (depth > 8) throw new GitError("bad-ref", "symbolic ref chain too deep");
      return this.readRef(t.slice(5).trim(), depth + 1);
    }
    return HEX40.test(t) ? t : void 0;
  }
  packedRefs() {
    const m = /* @__PURE__ */ new Map();
    let text2 = "";
    try {
      text2 = readFileSync5(join4(this.commonDir, "packed-refs"), "utf8");
    } catch {
      return m;
    }
    for (const l of text2.split("\n")) {
      if (!l || l[0] === "#" || l[0] === "^") continue;
      const sp = l.indexOf(" ");
      if (sp === 40 && HEX40.test(l.slice(0, 40))) m.set(l.slice(41).trim(), l.slice(0, 40));
    }
    return m;
  }
  /** Resolve a full ref name ("HEAD", "refs/heads/main", ...) to an object id. */
  readRef(name, depth = 0) {
    if (name !== "HEAD" && !this.safeRefName(name)) throw new GitError("bad-ref", `unsafe ref name: ${name}`);
    const base = name === "HEAD" || name.startsWith("HEAD") ? this.gitDir : this.commonDir;
    return this.readRefFile(join4(base, name), depth) ?? this.readRefFile(join4(this.commonDir, name), depth) ?? this.packedRefs().get(name);
  }
  /** All branches, remote branches and tags: name (without refs/ prefix) -> commit-ish id. */
  listRefs(limit = 5e3) {
    const out = /* @__PURE__ */ new Map();
    const walk = (dir, prefix, depth) => {
      if (depth > 10 || out.size >= limit) return;
      let entries = [];
      try {
        entries = readdirSync2(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.isDirectory()) walk(join4(dir, e.name), `${prefix}${e.name}/`, depth + 1);
        else if (e.isFile() && !e.name.endsWith(".lock")) {
          const sha = this.readRefFile(join4(dir, e.name));
          if (sha) out.set(prefix + e.name, sha);
        }
      }
    };
    for (const kind of ["heads", "remotes", "tags"]) walk(join4(this.commonDir, "refs", kind), `refs/${kind}/`, 0);
    for (const [k, v] of this.packedRefs()) if (!out.has(k) && /^refs\/(heads|remotes|tags)\//.test(k)) out.set(k, v);
    return [...out].map(([full, sha]) => ({ full, name: full.replace(/^refs\/(heads|remotes|tags)\//, (_m, k) => k === "tags" ? "tags/" : ""), sha }));
  }
  currentBranch() {
    try {
      const t = readFileSync5(join4(this.gitDir, "HEAD"), "utf8").trim();
      const m = /^ref: refs\/heads\/(.+)$/.exec(t);
      return m?.[1];
    } catch {
      return void 0;
    }
  }
  /**
   * Resolve a revision expression to a COMMIT id: HEAD, branch, remote branch (origin/main), tag, full or abbreviated id,
   * with optional ~N / ^N suffixes.
   */
  resolveCommit(rev) {
    const m = /^(.*?)((?:[~^]\d*)*)$/.exec(rev.trim());
    const baseName2 = m?.[1] ?? rev, suffix = m?.[2] ?? "";
    if (!baseName2) throw new GitError("bad-ref", `empty revision: ${rev}`);
    let sha;
    if (HEX40.test(baseName2)) sha = baseName2;
    else {
      for (const cand of baseName2 === "HEAD" ? ["HEAD"] : [baseName2, `refs/${baseName2}`, `refs/tags/${baseName2}`, `refs/heads/${baseName2}`, `refs/remotes/${baseName2}`, `refs/remotes/${baseName2}/HEAD`]) {
        if (cand !== "HEAD" && !this.safeRefName(cand)) continue;
        sha = this.readRef(cand);
        if (sha) break;
      }
      if (!sha && /^[0-9a-f]{4,39}$/.test(baseName2)) sha = this.expandAbbrev(baseName2);
    }
    if (!sha) throw new GitError("bad-ref", `unknown revision: ${rev}`);
    let c = this.peelToCommit(sha);
    for (const op of suffix.match(/[~^]\d*/g) ?? []) {
      const n = op.length > 1 ? Number(op.slice(1)) : 1;
      if (op[0] === "~") {
        for (let i = 0; i < n; i++) {
          const p = this.commit(c).parents[0];
          if (!p) throw new GitError("bad-ref", `${rev}: no such ancestor`);
          c = p;
        }
      } else if (n > 0) {
        const p = this.commit(c).parents[n - 1];
        if (!p) throw new GitError("bad-ref", `${rev}: no such parent`);
        c = p;
      }
    }
    if (suffix) this.commit(c);
    return c;
  }
  // ------------------------------------------------------------------ history
  /**
   * A merge base of two commits: the most recent common ancestor (by commit time). Returns undefined if none is reachable
   * (unrelated histories, or a shallow clone that does not contain it).
   */
  mergeBase(a, b, maxCommits = 1e5) {
    if (a === b) return a;
    const ancestorsOfA = /* @__PURE__ */ new Set();
    const queue = [a];
    while (queue.length && ancestorsOfA.size < maxCommits) {
      const c = queue.pop();
      if (ancestorsOfA.has(c)) continue;
      ancestorsOfA.add(c);
      try {
        queue.push(...this.commit(c).parents);
      } catch (e) {
        if (!(e instanceof GitError && e.code === "missing-object")) throw e;
      }
    }
    const seen = /* @__PURE__ */ new Set();
    const frontier = [];
    const push = (sha) => {
      if (seen.has(sha)) return;
      seen.add(sha);
      try {
        frontier.push(this.commit(sha));
      } catch (e) {
        if (!(e instanceof GitError && e.code === "missing-object")) throw e;
      }
    };
    push(b);
    let steps = 0;
    while (frontier.length && steps++ < maxCommits) {
      frontier.sort((x, y) => y.time - x.time);
      const c = frontier.shift();
      if (ancestorsOfA.has(c.sha)) return c.sha;
      for (const p of c.parents) push(p);
    }
    return void 0;
  }
};

// ../core/src/git/state.ts
var SCRIPT_READ_CAP2 = 256 * 1024;
var MAX_FILES = 5e3;
var isRegular = (mode) => mode === "100644" || mode === "100755" || mode === "100664";
var looksBinary = (b) => b.subarray(0, Math.min(b.length, 8e3)).includes(0);
var TreeIndex = class {
  constructor(repo, rootTree) {
    this.repo = repo;
    this.dirs.set("", new Map(repo.tree(rootTree).map((e) => [e.name, e])));
  }
  dirs = /* @__PURE__ */ new Map();
  entries(dir) {
    const hit = this.dirs.get(dir);
    if (hit) return hit;
    const slash = dir.lastIndexOf("/");
    const parent = this.entries(slash < 0 ? "" : dir.slice(0, slash));
    const e = parent?.get(slash < 0 ? dir : dir.slice(slash + 1));
    if (!e || e.mode !== "40000") return void 0;
    const m = new Map(this.repo.tree(e.sha).map((x) => [x.name, x]));
    this.dirs.set(dir, m);
    return m;
  }
  lookup(path) {
    const segs = path.split("/").filter(Boolean);
    if (!segs.length || segs.includes("..") || segs.includes(".git")) return void 0;
    const name = segs.pop();
    return this.entries(segs.join("/"))?.get(name);
  }
};
function snapshotCommit(repo, commit, label, opts = {}) {
  const cap2 = (opts.maxFileSizeKb ?? 1024) * 1024;
  const c = repo.commit(commit);
  const index = new TreeIndex(repo, c.tree);
  const files = [];
  const skipped = [];
  const tracked = /* @__PURE__ */ new Set();
  const walk = (treeSha, prefix, depth) => {
    if (depth > 12) return;
    for (const e of repo.tree(treeSha)) {
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.mode === "40000") {
        if (!SKIP_DIRS.has(e.name)) walk(e.sha, path, depth + 1);
        continue;
      }
      if (!isRegular(e.mode)) {
        if (e.mode === "120000" && classifyPath(path)) skipped.push({ path, reason: "symlink" });
        continue;
      }
      const kind = classifyPath(path);
      if (!kind) continue;
      tracked.add(path);
      if (files.length >= MAX_FILES) {
        skipped.push({ path, reason: "file limit" });
        continue;
      }
      let obj;
      try {
        obj = repo.readObject(e.sha);
      } catch (err) {
        if (err instanceof GitError && err.code === "missing-object") {
          skipped.push({ path, reason: "missing object" });
          continue;
        }
        throw err;
      }
      if (obj.data.length > cap2) {
        skipped.push({ path, reason: "too large" });
        continue;
      }
      if (looksBinary(obj.data)) {
        skipped.push({ path, reason: "binary" });
        continue;
      }
      files.push(parseFile(path, kind, obj.data.toString("utf8")));
    }
  };
  walk(c.tree, "", 0);
  const readFile = (p) => {
    try {
      const e = index.lookup(p.replace(/\\/g, "/"));
      if (!e || !isRegular(e.mode)) return void 0;
      const o = repo.readObject(e.sha);
      return o.data.length > SCRIPT_READ_CAP2 || looksBinary(o.data) ? void 0 : o.data.toString("utf8");
    } catch {
      return void 0;
    }
  };
  return { state: { label, files, readFile, tracked }, skipped, commit };
}
function snapshotWorkingTree(root, readFile, opts = {}) {
  const d = discover(root, { maxFileSizeKb: opts.maxFileSizeKb });
  return { state: { label: "working tree", files: d.files, readFile, tracked: readTrackedFiles(root) }, skipped: d.skipped };
}
function diffAgainst(root, baseRev, opts = {}) {
  const repo = GitRepo.open(root);
  try {
    const notes = [];
    const baseCommit = repo.resolveCommit(baseRev);
    let compared = baseCommit;
    let mergeBaseUsed = false;
    const headCommit = opts.headRev ? repo.resolveCommit(opts.headRev) : void 0;
    const tip = headCommit ?? repo.resolveCommit("HEAD");
    if (opts.useMergeBase !== false) {
      const mb = repo.mergeBase(baseCommit, tip);
      if (mb) {
        compared = mb;
        mergeBaseUsed = mb !== baseCommit;
        if (mergeBaseUsed) notes.push(`compared against the merge base ${mb.slice(0, 8)} of ${baseRev} and ${opts.headRev ?? "HEAD"}`);
      } else notes.push(`no common ancestor of ${baseRev} and ${opts.headRev ?? "HEAD"} is available (unrelated history or a shallow clone); compared against ${baseRev} directly`);
    }
    const baseSnap = snapshotCommit(repo, compared, `${baseRev}${mergeBaseUsed ? " (merge base)" : ""} @ ${compared.slice(0, 8)}`, { maxFileSizeKb: opts.maxFileSizeKb });
    let headState;
    let headSkipped = [];
    if (headCommit) {
      const s = snapshotCommit(repo, headCommit, `${opts.headRev} @ ${headCommit.slice(0, 8)}`, { maxFileSizeKb: opts.maxFileSizeKb });
      headState = s.state;
      headSkipped = s.skipped;
    } else if (opts.headState) headState = opts.headState;
    else {
      const w = snapshotWorkingTree(root, opts.readFileFromDisk ?? makeRepoReader(root), { maxFileSizeKb: opts.maxFileSizeKb });
      headState = w.state;
      headSkipped = w.skipped;
    }
    const index = new TreeIndex(repo, repo.commit(compared).tree);
    const readBase = (path) => {
      const e = index.lookup(path);
      if (!e || !isRegular(e.mode)) return void 0;
      try {
        const o = repo.readObject(e.sha);
        return o.type === "blob" && o.data.length <= SCRIPT_READ_CAP2 && !looksBinary(o.data) ? o.data.toString("utf8") : void 0;
      } catch {
        return void 0;
      }
    };
    let config2 = opts.config;
    let configSource;
    if (opts.configFrom === "none") config2 = {};
    else if (opts.configFrom === "base") {
      config2 = {};
      for (const c of configFileCandidates()) {
        const text2 = readBase(c.name);
        if (text2 !== void 0) {
          config2 = parseConfig(text2);
          configSource = { file: c.name, commit: compared };
          break;
        }
      }
      configSource ??= { commit: compared };
    }
    const baseFiles = {};
    for (const f of opts.baseFiles ?? []) baseFiles[f] = readBase(f);
    const result = diffStates(baseSnap.state, headState, { config: config2, contextLines: opts.contextLines });
    return { result, baseRev, baseCommit, comparedCommit: compared, headCommit, mergeBaseUsed, notes, baseFiles, configSource, skipped: { base: baseSnap.skipped, head: headSkipped } };
  } finally {
    repo.close();
  }
}
var REVISION_FILE_CAP = 4 * 1024 * 1024;
function readFileAtRevision(root, rev, path, opts = {}) {
  const repo = GitRepo.open(root);
  try {
    const notes = [];
    const baseCommit = repo.resolveCommit(rev);
    let commit = baseCommit;
    if (opts.useMergeBase !== false) {
      const tip = repo.resolveCommit(opts.headRev ?? "HEAD");
      const mb = repo.mergeBase(baseCommit, tip);
      if (mb) commit = mb;
      else notes.push(`no common ancestor of ${rev} and ${opts.headRev ?? "HEAD"} is available (unrelated history or a shallow clone); read from ${rev} directly`);
    }
    const e = new TreeIndex(repo, repo.commit(commit).tree).lookup(path);
    if (!e || !isRegular(e.mode)) return { commit, mergeBaseUsed: commit !== baseCommit, notes };
    const o = repo.readObject(e.sha);
    if (o.type !== "blob" || o.data.length > REVISION_FILE_CAP || looksBinary(o.data)) return { commit, mergeBaseUsed: commit !== baseCommit, notes };
    return { text: o.data.toString("utf8"), commit, mergeBaseUsed: commit !== baseCommit, notes };
  } finally {
    repo.close();
  }
}

// ../core/src/report/ruleHelp.ts
var RULE_HELP = {
  "AG-000": { name: "ConfigNotFullyAnalyzed", short: "An agent-config file could not be fully parsed or scanned.", full: "The file has syntax errors, or was too large to scan. An agent with a more lenient parser may still read it, so treat unanalyzed files as unreviewed." },
  "AG-001": { name: "PermissionWideningOrBypass", short: "Agent permissions are widened or permission prompts are bypassed.", full: "Flags allow rules that approve any command or tool without a prompt (bare Bash, Bash(*), wildcard prefixes of code-running or networking commands), writes outside the project, credential reads, bypassPermissions/auto/dontAsk default modes, and skip-prompt keys in shared project files. Does not see broad rules hidden behind scripts the allowed command runs." },
  "AG-002": { name: "AutoRunCommand", short: "A hook or helper command runs automatically from a repository-controlled file.", full: "Hook commands and helper keys (statusLine, apiKeyHelper, awsAuthRefresh, awsCredentialExport, ...) run without a prompt. The rule flags network tools, pipe-to-shell, base64 decode-and-run, inline interpreters and credential paths, and follows referenced repo scripts (as text, never executing them) to judge what they contain." },
  "AG-003": { name: "ProjectMcpAutoApproval", short: "Project settings pre-approve the MCP servers the repository ships.", full: "enableAllProjectMcpServers: true or enabledMcpjsonServers in a shared project file lets a repository approve its own servers, skipping the approval prompt." },
  "AG-004": { name: "LocalSettingsTracked", short: "A local settings file that should be personal is committed to git.", full: "settings.local.json is meant to stay untracked. A committed copy lets the repository ship hooks, env overrides and approvals as if they were the user's own choices." },
  "AG-005": { name: "EnvRedirectsCredentialsOrInjectsCode", short: "An env override redirects API traffic or injects code into agent subprocesses.", full: "Overriding *_BASE_URL or proxy variables to non-default hosts sends API keys and prompts elsewhere; LD_PRELOAD, NODE_OPTIONS preloads, a relative PATH, or a repository CA bundle inject code or intercept TLS. A corporate gateway looks the same in a static file, so confidence is medium for unknown hosts." },
  "AG-006": { name: "McpShellWrappedLaunch", short: "An MCP server is launched through a shell or inline interpreter.", full: "A shell wrapper, shell-line command string, or python -c / node -e launch lets configuration run arbitrary command lines when the server starts. The documented cmd /c launcher idiom is reported as info only." },
  "AG-007": { name: "McpUnpinnedPackage", short: "An MCP server runs a package without an exact version.", full: "npx/bunx/pnpm dlx/uvx/pipx launches without an exact version fetch whatever the registry serves at start time (supply-chain / rug-pull risk). Auto-confirm flags are reported separately. Well-known vendor packages are rated lower." },
  "AG-008": { name: "HardcodedSecret", short: "A credential is embedded in an agent config or instruction file.", full: "Known token formats (GitHub, AWS, Slack, Stripe, OpenAI, Anthropic, Google, npm, JWT, private keys, credentials in URLs) and credential-named keys with literal values. Evidence is redacted. Public/anon-role JWTs and Google API keys are rated lower." },
  "AG-009": { name: "McpRemoteTransport", short: "A remote MCP server uses plain HTTP or has no visible authentication.", full: "http:// or ws:// to non-loopback hosts exposes tokens and tool data in transit. A remote server without visible auth is reported at low confidence because some clients negotiate OAuth automatically." },
  "AG-010": { name: "McpOverbroadAccess", short: "An MCP server has overbroad filesystem or command access.", full: "Filesystem servers rooted at /, ~, drive roots or home directories; containers that mount the host root or the Docker socket or run privileged; and servers whose name suggests command execution (heuristic)." },
  "AG-011": { name: "KnownBadMcpPackage", short: "An MCP server launches a package that is known to be vulnerable or malicious.", full: "Matches the launched package against a small reviewed list (packages/core/src/intel/mcp-packages.json); every entry cites its sources and the date it was checked. A vulnerable package is flagged only when an exact pinned version is in the affected range; a package reported as malicious is flagged whatever the version. The list is deliberately short and offline: absence of a finding is not evidence that a package is safe." },
  "AG-012": { name: "McpOrHookDrift", short: "An MCP server definition or hook command changed, appeared or disappeared since it was locked.", full: "Compares the current MCP server definitions and hook commands with the hashes in the lock file (written by the lock command). A changed definition is the rug-pull pattern: something reviewed earlier now runs different code. Only produced by verify; the lock stores hashes and redacted summaries, never secret values." },
  "AG-013": { name: "McpScriptRisky", short: "An MCP server launches a repository script with risky behaviour.", full: "The launch script (read as text) reads credential paths, downloads and executes, decodes base64 and executes, or pipes into a shell. Network-only or spawn-only local servers are not reported." },
  "AG-014": { name: "PackageRegistryRedirected", short: "A package registry or index is redirected away from the default host.", full: "NPM_CONFIG_REGISTRY, PIP_INDEX_URL, UV_INDEX_URL, GOPROXY etc. in agent settings or MCP env/args, and registry/index entries in .npmrc, .yarnrc.yml, pip.conf and uv.toml. A company mirror looks identical to an attack in a static file." },
  "AG-020": { name: "HiddenUnicode", short: "Invisible Unicode characters (possibly hiding instructions) in a config or instruction file.", full: "Zero-width, bidi, tag and variation-selector characters are not shown by editors or diffs but are readable by language models. Hidden payloads are decoded where possible (tag characters, two-symbol zero-width binary, variation-selector bytes). BOMs, valid emoji sequences and joiners in Arabic/Indic scripts are ignored." },
  "AG-021": { name: "ExfiltrationInstruction", short: "An instruction tells the agent to read secrets and send them somewhere.", full: 'Sentence-level heuristic: a secret reference near a send/upload verb, with a destination URL (critical for webhook, tunnel and placeholder host classes). Negated sentences ("never commit .env") are skipped. Paraphrase and other languages can evade it.' },
  "AG-022": { name: "SilenceOrOverrideInstruction", short: "An instruction tells the agent to hide actions, ignore its rules, or skip confirmation.", full: 'Ignore-previous-instructions, hide-from-user, covert-action, false-authority and bypass-safeguards language. "Without asking for confirmation" alone is medium severity at low confidence.' },
  "AG-023": { name: "ConfigSelfPropagation", short: "Instructions or hooks copy agent configuration into other places.", full: "Text that tells the agent to spread agent-config files into other repositories, issues or docs, and hooks or tasks that write to CLAUDE.md, .mcp.json, rules or hooks files." },
  "AG-024": { name: "EncodedOrHiddenContent", short: "An instruction file contains encoded blobs, data: URIs, or instructions hidden in HTML comments or link titles.", full: "Long base64 (200+ characters) or hex (128+ digits) runs, including blobs wrapped over several lines; data: URIs (images are low, text and application types are high); HTML comments of 40+ characters that read like instructions to an agent (or very long comments); and link titles that read like instructions. Content a reviewer will not read but a model can. Heuristic: expect some false positives on files that embed images or fixtures." },
  "AG-025": { name: "UnrestrictedSkillOrSubagent", short: "A skill, custom command or subagent requests unrestricted tools or runs risky commands when used.", full: "Skills and commands: allowed-tools entries that pre-approve every tool or any shell command, risky hooks in frontmatter, and risky commands in !`...` or ```! blocks that run when the skill is invoked. Subagents: permissionMode bypassPermissions, wildcard tool grants, risky frontmatter hooks. Keys verified against the Claude Code skills and sub-agents documentation." },
  "AG-030": { name: "FolderOpenTask", short: "A VS Code task runs automatically when the folder is opened.", full: "Tasks with runOptions.runOn: folderOpen start when the folder is opened. Network tools, pipe-to-shell and credential paths are critical; repo scripts are judged by what they contain; known dev watchers are info." }
};

// ../core/package.json
var package_default = {
  name: "@tripwire/core",
  version: "0.1.0",
  type: "module",
  main: "src/index.ts",
  scripts: {
    test: "vitest run",
    typecheck: "tsc --noEmit -p ."
  },
  dependencies: {
    "jsonc-parser": "3.3.1",
    "smol-toml": "1.3.1"
  },
  devDependencies: {
    "@types/node": "22.10.0",
    ajv: "8.17.1",
    "ajv-draft-04": "1.0.0",
    "ajv-formats": "3.0.1",
    tsx: "4.19.2",
    typescript: "5.6.3",
    vitest: "2.1.8"
  }
};

// ../core/src/report/sarif.ts
var TOOL_VERSION = package_default.version;
var SARIF_SCHEMA = "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json";
var sarifLevel = (s) => s === "critical" || s === "high" ? "error" : s === "medium" ? "warning" : "note";
var SECURITY_SEVERITY = { critical: "9.5", high: "8.0", medium: "5.5", low: "3.0", info: "1.0" };
var encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");
function artifact(file) {
  return file.startsWith("~/") ? { uri: encodePath(file.slice(2)), uriBaseId: "%USERPROFILE%" } : { uri: encodePath(file), uriBaseId: "%SRCROOT%" };
}
function sarifRegion(r) {
  const startLine = r.startLine + 1, startColumn = r.startCol + 1, endLine = r.endLine + 1;
  let endColumn = r.endCol + 1;
  if (endLine === startLine && endColumn <= startColumn) endColumn = startColumn + 1;
  return { startLine, startColumn, endLine, endColumn };
}
function fixOf(f, a) {
  return {
    description: { text: a.description },
    artifactChanges: [{
      artifactLocation: artifact(a.file),
      replacements: a.edits.map((e) => ({
        deletedRegion: sarifRegion(e.range),
        ...e.newText ? { insertedContent: { text: e.newText } } : {}
      }))
    }]
  };
}
function ruleDescriptor(r, helpBase) {
  const h = RULE_HELP[r.id];
  return {
    id: r.id,
    name: h?.name ?? r.id,
    shortDescription: { text: h?.short ?? r.id },
    fullDescription: { text: h?.full ?? h?.short ?? r.id },
    ...helpBase ? { helpUri: `${helpBase}#${r.id.toLowerCase()}` } : {},
    help: { text: `${h?.full ?? ""}

See docs/RULES.md for what this rule catches, what it misses, and false-positive notes.`.trim() },
    defaultConfiguration: { level: sarifLevel(r.defaultSeverity) },
    properties: {
      tags: ["security", ...r.category ? [`category/${r.category}`] : [], ...r.experimental ? ["experimental"] : []],
      "security-severity": SECURITY_SEVERITY[r.defaultSeverity]
    }
  };
}
function toSarif(opts) {
  const rules = opts.rules ?? ALL_RULES;
  const helpBase = opts.helpBaseUri ?? (PRODUCT.docsUrl || void 0);
  const descriptors = [
    ruleDescriptor({ id: "AG-000", category: "execution", defaultSeverity: "low" }, helpBase),
    ...rules.map((r) => ruleDescriptor({ id: r.id, category: r.category, defaultSeverity: r.defaultSeverity, experimental: r.experimental }, helpBase))
  ];
  const index = new Map(descriptors.map((d, i) => [d.id, i]));
  const ensureRule = (f) => {
    let i = index.get(f.ruleId);
    if (i === void 0) {
      i = descriptors.length;
      descriptors.push(ruleDescriptor({ id: f.ruleId, category: f.category, defaultSeverity: f.severity }, helpBase));
      index.set(f.ruleId, i);
    }
    return i;
  };
  const fpKey = `${PRODUCT.id}Identity/v1`;
  const toResult = (f, suppression) => {
    const ruleIndex = ensureRule(f);
    const baseline = opts.baselineStates?.get(f);
    const fixes = opts.includeFixes ? (f.autofix ?? []).filter((a) => !a.input && a.edits.length).map((a) => fixOf(f, a)) : [];
    return {
      ruleId: f.ruleId,
      ruleIndex,
      level: sarifLevel(f.severity),
      message: { text: redactSecretsInText(`${f.title}. ${f.whyItMatters}`) },
      locations: [{ physicalLocation: { artifactLocation: artifact(f.file), region: sarifRegion(f.range) } }],
      partialFingerprints: { [fpKey]: identityHash(f) },
      ...baseline ? { baselineState: baseline } : {},
      ...fixes.length ? { fixes } : {},
      ...suppression !== void 0 ? { suppressions: [{ kind: "external", justification: suppression }] } : {},
      properties: {
        severity: f.severity,
        confidence: f.confidence,
        category: f.category,
        evidence: redactSecretsInText(f.evidence),
        remediation: redactSecretsInText(f.fix),
        ...f.experimental ? { experimental: true } : {},
        ...f.introducedByChange ? { introducedByChange: true } : {}
      }
    };
  };
  const results = [
    ...opts.findings.map((f) => toResult(f)),
    ...opts.includeSuppressed ? (opts.suppressed ?? []).map((s) => toResult(s.finding, s.reason)) : []
  ];
  return {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: PRODUCT.name, version: opts.toolVersion ?? TOOL_VERSION, semanticVersion: opts.toolVersion ?? TOOL_VERSION, rules: descriptors } },
      ...opts.rootUri ? { originalUriBaseIds: { "%SRCROOT%": { uri: opts.rootUri.endsWith("/") ? opts.rootUri : opts.rootUri + "/" } } } : {},
      columnKind: "utf16CodeUnits",
      invocations: [{ executionSuccessful: true }],
      results
    }]
  };
}

// ../core/src/report/json.ts
function countBySeverity(findings) {
  const out = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) out[f.severity]++;
  return out;
}

// ../core/src/report/text.ts
var ANSI = { critical: "\x1B[1;31m", high: "\x1B[31m", medium: "\x1B[33m", low: "\x1B[36m", info: "\x1B[2m" };
var RESET = "\x1B[0m";
var BOLD = "\x1B[1m";
var pad = (s, n) => s.length >= n ? s : s + " ".repeat(n - s.length);
var clip2 = (s, n) => s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
function toTextReport(findings, opts = {}) {
  const paint = (s, sev2) => opts.color ? ANSI[sev2] + s + RESET : s;
  const bold = (s) => opts.color ? BOLD + s + RESET : s;
  const sorted = [...findings].sort((a, b) => sevRank(b.severity) - sevRank(a.severity) || a.file.localeCompare(b.file) || a.range.startLine - b.range.startLine);
  const lines = [];
  if (!sorted.length) lines.push(`${PRODUCT.name}: no findings.`);
  for (const f of sorted) {
    lines.push(`${paint(pad(f.severity.toUpperCase(), 8), f.severity)} ${pad(f.ruleId, 7)} ${f.file}:${f.range.startLine + 1}  ${redactSecretsInText(f.title)}  (${f.confidence} confidence)`);
    if (f.evidence) lines.push(`         evidence: ${clip2(redactSecretsInText(f.evidence).replace(/\s*\n\s*/g, " \u23CE "), opts.maxEvidence ?? 160)}`);
  }
  const c = countBySeverity(findings);
  lines.push("", bold("Summary"));
  lines.push(`  ${paint("critical", "critical")} ${c.critical}   ${paint("high", "high")} ${c.high}   ${paint("medium", "medium")} ${c.medium}   ${paint("low", "low")} ${c.low}   ${paint("info", "info")} ${c.info}   total ${findings.length}${opts.suppressed ? `   suppressed ${opts.suppressed}` : ""}`);
  lines.push(`  ${PRODUCT.name} is a pre-flight check. It cannot see malicious code in the project's source.`);
  return lines.join("\n");
}

// ../core/src/histreport/build.ts
var emptyCounts = () => ({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
var TREND_METHOD = "For each calendar month (UTC) in the window, the repository is scanned as it was at the last commit on or before the end of that month (for the current month: the latest commit), and open findings are counted by severity. 'Introduced' and 'resolved' count findings whose introducing or resolving commit date falls inside that month. Months before the first commit are left out.";
function sortFindings(fs) {
  const conf = { high: 0, medium: 1, low: 2 };
  return [...fs].sort((a, b) => (a.status === b.status ? 0 : a.status === "open" ? -1 : 1) || sevRank(b.severity) - sevRank(a.severity) || conf[a.confidence] - conf[b.confidence] || (b.introducedIn?.date ?? "").localeCompare(a.introducedIn?.date ?? "") * (a.introducedIn && b.introducedIn ? 1 : 0) || (a.introducedIn ? 0 : 1) - (b.introducedIn ? 0 : 1) || a.repo.localeCompare(b.repo) || a.file.localeCompare(b.file) || a.range.startLine - b.range.startLine || a.ruleId.localeCompare(b.ruleId));
}
function summarize(findings, repos) {
  const bySeverity = emptyCounts();
  let resolved = 0;
  const per = new Map(repos.map((r) => [r.name, { repo: r.name, open: 0, resolved: 0, bySeverity: emptyCounts() }]));
  for (const f of findings) {
    const p = per.get(f.repo);
    if (f.status === "resolved") {
      resolved++;
      if (p) p.resolved++;
      continue;
    }
    bySeverity[f.severity]++;
    if (p) {
      p.open++;
      p.bySeverity[f.severity]++;
    }
  }
  const open = SEVERITY_ORDER.reduce((n, s) => n + bySeverity[s], 0);
  return { open, resolved, highCritical: bySeverity.high + bySeverity.critical, bySeverity, perRepo: [...per.values()] };
}
function assembleReport(i) {
  const findings = sortFindings(i.findings);
  return {
    schemaVersion: 1,
    meta: { tool: { name: PRODUCT.name, version: TOOL_VERSION }, generatedAt: i.now.toISOString(), demo: i.demo, options: i.options, repos: i.repos },
    summary: summarize(findings, i.repos),
    trend: { windowMonths: i.options.months, method: TREND_METHOD, months: i.months },
    findings
  };
}

// ../core/src/histreport/escape.ts
var INVISIBLE = new RegExp(
  "[\\u0000-\\u001F\\u007F-\\u009F\\u00AD\\u034F\\u061C\\u115F\\u1160\\u17B4\\u17B5\\u180B-\\u180F\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u206F\\u3164\\uFE00-\\uFE0F\\uFEFF\\uFFA0\\uFFF0-\\uFFFB\\u{E0000}-\\u{E01EF}]|[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]",
  "gu"
);
var hex = (cp) => `<U+${cp.toString(16).toUpperCase().padStart(4, "0")}>`;
function visible(s) {
  return String(s).replace(/[\r\n\t]+/g, " ").replace(INVISIBLE, (m) => hex(m.codePointAt(0)));
}
function clip3(s, max) {
  const cps = Array.from(s);
  return cps.length <= max ? s : cps.slice(0, max).join("") + ` ...[${cps.length - max} more characters]`;
}
var MAX_FIELD = 400;
var SCHEMES = /\b(https?|ftps?|wss?|file|javascript|vbscript|data|blob|mailto|tel|about):/gi;
function defang(s) {
  return s.replace(SCHEMES, "$1[:]");
}
function text(s, max = MAX_FIELD) {
  return defang(visible(clip3(String(s), max)));
}
var HTML = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };
function escapeHtml(s, max = MAX_FIELD) {
  return text(s, max).replace(/[&<>"'`]/g, (c) => HTML[c]);
}
function mdCell(s, max = MAX_FIELD) {
  return text(s, max).replace(/[\\|`*_{}\[\]<>#!~&]/g, (c) => "\\" + c);
}

// ../core/src/histreport/render.ts
var COVERAGE_TEXT = "This report flags known risky patterns in the files that configure AI coding agents (agent settings, MCP server definitions, instruction files and tasks), using fixed rules, offline. It does not read your application source code, dependencies or build scripts, and it does not show that a repository is free of problems. Each finding is dated to the first-parent commit at which it appeared; commits that arrived through a merge are attributed to the merge, a renamed file starts a new finding, and a shallow or truncated history only gives 'on or before' dates. Monthly counts are computed by scanning the repository as it was at the end of each month with today's rules, so a rule added recently also counts findings from earlier months. Suppressions and size limits are read from the current version of the repository's configuration unless --no-repo-config is used.";
var DEMO_TEXT = "DEMO DATA (synthetic)";
var SEV_LABEL = { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info" };
var SEV_DESC = [...SEVERITY_ORDER].reverse();
var day = (iso) => iso.slice(0, 10);
var plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
function renderJson(d) {
  return JSON.stringify(d, null, 2) + "\n";
}
function origin(f) {
  const i = f.introducedIn;
  if (!i) return "n/a (no git history)";
  let s = (i.exact ? "" : "on or before ") + i.commit;
  if (i.subject) s += ` "${i.subject}"`;
  if (i.author) s += ` by ${i.author}`;
  return s;
}
var originDate = (f) => f.introducedIn ? day(f.introducedIn.date) + (f.introducedIn.exact ? "" : " or earlier") : "n/a";
function resolvedAt(f) {
  const r = f.resolvedIn;
  if (!r) return "n/a";
  let s = `${r.commit} (${day(r.date)})`;
  if (r.subject) s += ` "${r.subject}"`;
  if (r.author) s += ` by ${r.author}`;
  return s;
}
var rule = (f) => `${f.ruleId}: ${f.title}`;
var where = (f) => `${f.file}:${f.range.startLine}`;
function summarySentence(d) {
  const repos = d.meta.repos.length;
  return `${plural(d.summary.open, "open finding")} across ${plural(repos, "repository", "repositories")}; ${d.summary.highCritical} high/critical; trend over the last ${plural(d.trend.windowMonths, "month")}.`;
}
var openFindings = (d) => d.findings.filter((f) => f.status === "open");
var resolvedFindings = (d) => d.findings.filter((f) => f.status === "resolved");
var trendRow = (t, c = t.open) => [t.month, c.critical, c.high, c.medium, c.low, c.info, t.highCritical, t.introduced, t.resolved];
function mdTable(head, rows) {
  const line = (cells) => `| ${cells.join(" | ")} |`;
  return [line(head), line(head.map(() => "---")), ...rows.map((r) => line(r.map(String)))].join("\n");
}
function renderMarkdown(d) {
  const out = [];
  out.push(`# ${mdCell(d.meta.tool.name)} report`);
  if (d.meta.demo) out.push(`> **${DEMO_TEXT}**`);
  out.push(`Scan date: ${mdCell(day(d.meta.generatedAt))}`);
  out.push("## Summary", mdCell(summarySentence(d)));
  for (const r of d.meta.repos) for (const n of r.notes) out.push(`- ${mdCell(r.name)}: ${mdCell(n)}`);
  out.push("## Trend");
  out.push(d.trend.months.length ? mdTable(["Month", "Critical", "High", "Medium", "Low", "Info", "High+critical", "Introduced", "Resolved"], d.trend.months.map((t) => trendRow(t).map((c) => typeof c === "string" ? mdCell(c) : c))) : "No monthly history is available.");
  out.push(mdCell(d.trend.method, 2e3));
  out.push("## Counts by severity");
  out.push(mdTable(["Severity", "Open"], SEV_DESC.map((s) => [SEV_LABEL[s], d.summary.bySeverity[s]])));
  if (d.meta.repos.length > 1) {
    out.push(mdTable(
      ["Repository", "Open", "Critical", "High", "Medium", "Low", "Info", "Resolved"],
      d.summary.perRepo.map((r) => [mdCell(r.repo), r.open, r.bySeverity.critical, r.bySeverity.high, r.bySeverity.medium, r.bySeverity.low, r.bySeverity.info, r.resolved])
    ));
  }
  out.push("## Findings");
  const open = openFindings(d);
  if (!open.length) out.push("No open findings.");
  for (const s of SEV_DESC) {
    const fs = open.filter((f) => f.severity === s);
    if (!fs.length) continue;
    out.push(`### ${SEV_LABEL[s]}`);
    out.push(mdTable(["Repo", "Rule", "File:line", "Commit", "Date", "Fix"], fs.map((f) => [mdCell(f.repo), mdCell(rule(f)), mdCell(where(f)), mdCell(origin(f)), mdCell(originDate(f)), mdCell(f.fix)])));
  }
  out.push("## Resolved this period");
  const res = resolvedFindings(d);
  out.push(res.length ? mdTable(["Repo", "Rule", "Severity", "File:line", "Introduced", "Resolved"], res.map((f) => [mdCell(f.repo), mdCell(rule(f)), SEV_LABEL[f.severity], mdCell(where(f)), mdCell(origin(f)), mdCell(resolvedAt(f))])) : "None.");
  out.push("## What this report does and does not cover", mdCell(COVERAGE_TEXT, 4e3));
  out.push("## Run details");
  out.push(`- Tool: ${mdCell(d.meta.tool.name)} ${mdCell(d.meta.tool.version)}`, `- Generated: ${mdCell(d.meta.generatedAt)}`);
  for (const r of d.meta.repos) out.push(`- ${mdCell(r.name)}: ${r.git ? `commits examined ${r.commitsExamined}, range ${mdCell(r.firstCommit ?? "n/a")}..${mdCell(r.headCommit ?? "n/a")}` : "no git history"}`);
  if (d.meta.demo) out.push(`- ${DEMO_TEXT}`);
  return out.join("\n\n") + "\n";
}
var CSS = `
:root{color-scheme:light}
body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111;background:#fff;margin:0 auto;padding:24px;max-width:1000px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:28px 0 8px;border-bottom:1px solid #999;padding-bottom:4px}h3{font-size:15px;margin:18px 0 6px}
table{border-collapse:collapse;width:100%;table-layout:fixed;margin:6px 0 12px}
th,td{border:1px solid #888;padding:4px 6px;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}
th{background:#eee}
#demo-banner{border:3px solid #000;padding:8px 12px;font-weight:700;font-size:18px;margin:0 0 16px;text-align:center}
.muted{color:#444}.note{font-size:12px}svg{max-width:100%;height:auto;border:1px solid #bbb;margin:6px 0}
@media print{
  @page{margin:14mm}
  body{padding:0;max-width:none;font-size:11pt}
  #findings,#resolved,#coverage{break-before:page}
  tr,svg,h2,h3{break-inside:avoid}h2,h3{break-after:avoid}
  thead{display:table-header-group}
}`;
function table(head, rows, rowAttrs) {
  const th = head.map((c) => `<th scope="col">${c}</th>`).join("");
  const body = rows.map((r, i) => `<tr${rowAttrs ? rowAttrs(i) : ""}>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}
var labelEvery = (stepPx, minPx = 38) => Math.max(1, Math.ceil(minPx / Math.max(stepPx, 1)));
function barChart(months) {
  const W = 640, H = 220, L = 40, B = 30, T = 18, R = 10;
  const max = Math.max(1, ...months.map((t) => t.highCritical));
  const n = months.length;
  const bw = (W - L - R) / n;
  const k = labelEvery(bw);
  const bars = months.map((t, i) => {
    const bh = (H - T - B) * t.highCritical / max;
    const x = L + i * bw + bw * 0.15;
    const y = H - B - bh;
    const cx = (x + bw * 0.35).toFixed(1);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${bh.toFixed(1)}" fill="#333"/>` + (bw >= String(t.highCritical).length * 7 + 4 ? `<text x="${cx}" y="${(y - 3).toFixed(1)}" font-size="11" text-anchor="middle">${t.highCritical}</text>` : "") + ((n - 1 - i) % k === 0 ? `<text x="${cx}" y="${H - 12}" font-size="10" text-anchor="middle">${escapeHtml(t.month.slice(2))}</text>` : "");
  }).join("");
  return `<svg role="img" aria-label="High and critical open findings at the end of each month" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#000"/><line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="#000"/><text x="${L - 4}" y="${T + 4}" font-size="10" text-anchor="end">${max}</text><text x="${L - 4}" y="${H - B}" font-size="10" text-anchor="end">0</text>${bars}</svg>`;
}
var DASH = { critical: "", high: "6 3", medium: "2 3", low: "8 3 2 3", info: "1 4" };
function lineChart(months) {
  const W = 640, H = 240, L = 40, B = 30, T = 18, R = 120;
  const n = months.length;
  const max = Math.max(1, ...months.flatMap((t) => SEV_DESC.map((s) => t.open[s])));
  const step = n > 1 ? (W - L - R - 10) / (n - 1) : 0;
  const xy = (i, v) => [L + 5 + i * step, H - B - (H - T - B) * v / max];
  const lines = SEV_DESC.map((s) => {
    const pts = months.map((t, i) => xy(i, t.open[s]).map((v) => v.toFixed(1)).join(",")).join(" ");
    const dots = n <= 12 ? months.map((t, i) => {
      const [cx, cy] = xy(i, t.open[s]);
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2" fill="#000"/>`;
    }).join("") : "";
    return `<polyline points="${pts}" fill="none" stroke="#000" stroke-width="1.6" stroke-dasharray="${DASH[s]}"/>${dots}`;
  }).join("");
  const legend = SEV_DESC.map((s, i) => {
    const y = T + 8 + i * 20;
    return `<line x1="${W - R + 14}" y1="${y}" x2="${W - R + 46}" y2="${y}" stroke="#000" stroke-width="1.6" stroke-dasharray="${DASH[s]}"/><text x="${W - R + 52}" y="${y + 4}" font-size="11">${SEV_LABEL[s]}</text>`;
  }).join("");
  const k = labelEvery(step || 1e3);
  const xl = months.map((t, i) => (n - 1 - i) % k === 0 ? `<text x="${xy(i, 0)[0].toFixed(1)}" y="${H - 12}" font-size="10" text-anchor="middle">${escapeHtml(t.month.slice(2))}</text>` : "").join("");
  return `<svg role="img" aria-label="Open findings by severity at the end of each month" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#000"/><line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="#000"/><text x="${L - 4}" y="${T + 4}" font-size="10" text-anchor="end">${max}</text><text x="${L - 4}" y="${H - B}" font-size="10" text-anchor="end">0</text>${lines}${legend}${xl}</svg>`;
}
function renderHtml(d) {
  const name = escapeHtml(d.meta.tool.name);
  const o = [];
  o.push(
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${name} report</title><style>${CSS}</style></head><body>`
  );
  if (d.meta.demo) o.push(`<div id="demo-banner">${DEMO_TEXT}</div>`);
  o.push(`<header id="title"><h1>${name} report</h1><p class="muted">Scan date: ${escapeHtml(day(d.meta.generatedAt))}</p></header>`);
  o.push(`<section id="summary"><h2>Summary</h2><p>${escapeHtml(summarySentence(d))}</p>`);
  const notes = d.meta.repos.flatMap((r) => r.notes.map((n) => `<li>${escapeHtml(r.name)}: ${escapeHtml(n)}</li>`));
  if (notes.length) o.push(`<ul class="note">${notes.join("")}</ul>`);
  o.push("</section>");
  o.push('<section id="trend"><h2>Trend</h2>');
  if (d.trend.months.length) {
    o.push("<h3>High and critical findings open at the end of each month</h3>", barChart(d.trend.months));
    o.push("<h3>Open findings by severity</h3>", lineChart(d.trend.months));
    o.push(table(
      ["Month", "Critical", "High", "Medium", "Low", "Info", "High+critical", "Introduced", "Resolved"],
      d.trend.months.map((t) => trendRow(t).map((c) => escapeHtml(String(c))))
    ));
  } else o.push("<p>No monthly history is available.</p>");
  o.push(`<p class="note">${escapeHtml(d.trend.method, 2e3)}</p></section>`);
  o.push('<section id="severity-counts"><h2>Counts by severity</h2>');
  o.push(table(["Severity", "Open findings"], SEV_DESC.map((s) => [SEV_LABEL[s], String(d.summary.bySeverity[s])])));
  if (d.meta.repos.length > 1) {
    o.push(table(
      ["Repository", "Open", "Critical", "High", "Medium", "Low", "Info", "Resolved"],
      d.summary.perRepo.map((r) => [escapeHtml(r.repo), String(r.open), String(r.bySeverity.critical), String(r.bySeverity.high), String(r.bySeverity.medium), String(r.bySeverity.low), String(r.bySeverity.info), String(r.resolved)])
    ));
  }
  o.push("</section>");
  o.push('<section id="findings"><h2>Findings</h2>');
  const open = openFindings(d);
  if (!open.length) o.push("<p>No open findings.</p>");
  for (const s of SEV_DESC) {
    const fs = open.filter((f) => f.severity === s);
    if (!fs.length) continue;
    o.push(`<h3 data-severity="${s}">${SEV_LABEL[s]} (${fs.length})</h3>`);
    o.push(table(
      ["Repo", "Rule", "File:line", "Commit", "Date", "Fix"],
      fs.map((f) => [escapeHtml(f.repo), escapeHtml(rule(f)), escapeHtml(where(f)), escapeHtml(origin(f)), escapeHtml(originDate(f)), escapeHtml(f.fix, 300)]),
      () => ` class="finding" data-severity="${s}"`
    ));
  }
  o.push("</section>");
  o.push('<section id="resolved"><h2>Resolved this period</h2>');
  const res = resolvedFindings(d);
  o.push(res.length ? table(["Repo", "Rule", "Severity", "File:line", "Introduced", "Resolved"], res.map((f) => [escapeHtml(f.repo), escapeHtml(rule(f)), SEV_LABEL[f.severity], escapeHtml(where(f)), escapeHtml(origin(f)), escapeHtml(resolvedAt(f))])) : "<p>None.</p>");
  o.push("</section>");
  o.push(`<section id="coverage"><h2>What this report does and does not cover</h2><p>${escapeHtml(COVERAGE_TEXT, 4e3)}</p></section>`);
  o.push('<footer id="footer"><h2>Run details</h2><ul class="note">');
  o.push(`<li>Tool: ${name} ${escapeHtml(d.meta.tool.version)}</li><li>Generated: ${escapeHtml(d.meta.generatedAt)}</li>`);
  for (const r of d.meta.repos) o.push(`<li>${escapeHtml(r.name)}: ${r.git ? `commits examined ${r.commitsExamined}, range ${escapeHtml(r.firstCommit ?? "n/a")}..${escapeHtml(r.headCommit ?? "n/a")}` : "no git history"}</li>`);
  if (d.meta.demo) o.push(`<li><strong>${DEMO_TEXT}</strong></li>`);
  o.push("</ul></footer></body></html>");
  return o.join("\n") + "\n";
}

// ../core/src/histreport/history.ts
import { existsSync as existsSync4 } from "node:fs";
import { basename, join as join5 } from "node:path";
var EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}/g;
var PROCESS_MAX = 8192;
var short = (sha) => sha.slice(0, 8);
var isoOf = (sec) => new Date(sec * 1e3).toISOString();
var noEmails = (s) => s.replace(EMAIL, "<email removed>");
var AUTH_HEADER2 = /\b(Bearer|Basic|Token)\s{1,8}[A-Za-z0-9._~+\/=-]{16,4096}/gi;
var KEY_VALUE = /\b(api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|passw(?:or)?d|passwd)(\s{0,8}[=:]\s{0,8})(["']?)[^\s"'&]{8,4096}/gi;
function redactSecrets(s) {
  let out = s.length > PROCESS_MAX ? s.slice(0, PROCESS_MAX) : s;
  for (const p of SECRET_PATTERNS) out = out.replace(p.re, (m) => redact(m));
  return out.replace(AUTH_HEADER2, "$1 [redacted]").replace(KEY_VALUE, "$1$2$3[redacted]");
}
var clean = (s, root) => {
  let out = noEmails(redactSecrets(s));
  for (const r of /* @__PURE__ */ new Set([root, root.split("\\").join("/")])) if (r.length > 3) out = out.split(r).join(".");
  return out;
};
var cap = (s, n) => Array.from(s).slice(0, n).join("");
function firstParentChain(repo, head, max) {
  const out = [];
  let shallow = false, truncated = false;
  let cur = head;
  while (cur) {
    let c;
    try {
      c = repo.commit(cur);
    } catch (e) {
      if (e instanceof GitError && e.code === "missing-object") {
        shallow = true;
        break;
      }
      throw e;
    }
    out.push(c);
    cur = c.parents[0];
    if (cur && out.length >= max) {
      truncated = true;
      break;
    }
  }
  out.reverse();
  return { commits: out.map((c) => ({ sha: c.sha, short: short(c.sha), time: c.time, subject: c.subject, author: c.author, tree: c.tree })), shallow, truncated };
}
function touches(repo, a, b, watched, prefix = "", depth = 0) {
  if (a === b || depth > 14) return false;
  const left = new Map(repo.tree(a).map((e) => [e.name, e]));
  const right = new Map(repo.tree(b).map((e) => [e.name, e]));
  for (const name of /* @__PURE__ */ new Set([...left.keys(), ...right.keys()])) {
    const l = left.get(name), r = right.get(name);
    if (l && r && l.sha === r.sha && l.mode === r.mode) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    const lDir = l?.mode === "40000", rDir = r?.mode === "40000";
    if (lDir || rDir) {
      if (SKIP_DIRS.has(name)) continue;
      if (lDir && rDir) {
        if (touches(repo, l.sha, r.sha, watched, path, depth + 1)) return true;
        continue;
      }
      if (lDir && dirTouches(repo, l.sha, watched, path, depth + 1)) return true;
      if (rDir && dirTouches(repo, r.sha, watched, path, depth + 1)) return true;
      if (!lDir && l || !rDir && r) {
        if (relevantPath(path, watched)) return true;
      }
      continue;
    }
    if (relevantPath(path, watched)) return true;
  }
  return false;
}
function dirTouches(repo, sha, watched, prefix, depth) {
  if (depth > 14) return false;
  for (const e of repo.tree(sha)) {
    const path = `${prefix}/${e.name}`;
    if (e.mode === "40000") {
      if (!SKIP_DIRS.has(e.name) && dirTouches(repo, e.sha, watched, path, depth + 1)) return true;
    } else if (relevantPath(path, watched)) return true;
  }
  return false;
}
var relevantPath = (path, watched) => !!classifyPath(path) || watched.has(path);
function keyed(findings) {
  const seen = /* @__PURE__ */ new Map();
  const out = /* @__PURE__ */ new Map();
  for (const f of findings) {
    const base = identityKey(f);
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    out.set(`${base}#${k}`, f);
  }
  return out;
}
function loadRepoConfig(path, options, notes) {
  if (!options.repoConfig) return {};
  return loadConfig(path, { onNote: (m) => notes.push(clean(m, path)) });
}
function analyzePlain(input, options, notes) {
  const config2 = loadRepoConfig(input.path, options, notes);
  const { files } = discover(input.path, { maxFileSizeKb: config2.maxFileSizeKb });
  const res = scanFiles(files, { root: input.path, config: config2, trackedFiles: readTrackedFiles(input.path), readFile: makeRepoReader(input.path) });
  const plain = res.findings.filter((f) => sevRank(f.severity) >= sevRank(options.minSeverity));
  return { meta: { name: input.name, git: false, shallow: false, truncated: false, commitsExamined: 0, firstCommit: null, headCommit: null, headDate: null, notes }, chain: [], spans: [], plain };
}
function analyzeRepo(input, options) {
  const notes = [];
  if (!existsSync4(join5(input.path, ".git"))) {
    notes.push("no .git directory: commit attribution and the monthly trend are unavailable; the folder was scanned as it is");
    return analyzePlain(input, options, notes);
  }
  let repo;
  try {
    repo = GitRepo.open(input.path);
  } catch (e) {
    if (!(e instanceof GitError)) throw e;
    notes.push(`git history could not be read (${e.code}): commit attribution and the monthly trend are unavailable; the folder was scanned as it is`);
    return analyzePlain(input, options, notes);
  }
  try {
    let head;
    try {
      head = repo.resolveCommit("HEAD");
    } catch (e) {
      if (!(e instanceof GitError)) throw e;
      notes.push("the repository has no commits yet: nothing to report");
      return { meta: { name: input.name, git: true, shallow: false, truncated: false, commitsExamined: 0, firstCommit: null, headCommit: null, headDate: null, notes }, chain: [], spans: [] };
    }
    const config2 = loadRepoConfig(input.path, options, notes);
    const { commits, shallow, truncated } = firstParentChain(repo, head, options.maxCommits);
    if (shallow) notes.push(`shallow history: findings present in the oldest available commit ${commits[0].short} are dated 'on or before' that commit`);
    if (truncated) notes.push(`history limited to the newest ${options.maxCommits} commits (--max-commits): findings present in commit ${commits[0].short} are dated 'on or before' that commit`);
    const inexactStart = shallow || truncated;
    const open = /* @__PURE__ */ new Map();
    const spans = [];
    let watched = /* @__PURE__ */ new Set();
    for (let i = 0; i < commits.length; i++) {
      const c = commits[i];
      if (i > 0 && !touches(repo, commits[i - 1].tree, c.tree, watched)) continue;
      const snap = snapshotCommit(repo, c.sha, c.short, { maxFileSizeKb: config2.maxFileSizeKb });
      const requested = /* @__PURE__ */ new Set();
      const base = snap.state.readFile;
      const readFile = (p) => {
        requested.add(p.replace(/\\/g, "/").replace(/^\.\//, ""));
        return base?.(p);
      };
      const res = scanFiles(snap.state.files, { root: "", config: config2, trackedFiles: snap.state.tracked, readFile });
      watched = requested;
      const cur = keyed(res.findings.filter((f) => sevRank(f.severity) >= sevRank(options.minSeverity)));
      for (const [k, f] of cur) {
        const s = open.get(k);
        if (s) s.finding = f;
        else {
          const ns = { finding: f, from: i, exact: !(i === 0 && inexactStart) };
          open.set(k, ns);
          spans.push(ns);
        }
      }
      for (const [k, s] of open) if (!cur.has(k)) {
        s.to = i;
        open.delete(k);
      }
    }
    const last = commits[commits.length - 1];
    return {
      meta: { name: input.name, git: true, shallow, truncated, commitsExamined: commits.length, firstCommit: commits[0].short, headCommit: last.short, headDate: isoOf(last.time), notes },
      chain: commits,
      spans
    };
  } finally {
    repo.close();
  }
}
var monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
function windowMonths(now, n) {
  const out = [];
  const y0 = now.getUTCFullYear(), m0 = now.getUTCMonth();
  for (let k = n - 1; k >= 0; k--) {
    const idx = y0 * 12 + m0 - k;
    const y = Math.floor(idx / 12), m = idx - y * 12;
    out.push({ month: monthKey(y, m), startSec: Date.UTC(y, m, 1) / 1e3, endSec: Date.UTC(y, m + 1, 1) / 1e3 });
  }
  return out;
}
function commitRef(c, options) {
  const r = { commit: c.short, date: isoOf(c.time) };
  if (options.includeSubjects) r.subject = cap(clean(cap(c.subject, 400), ""), 80);
  if (options.includeAuthors) r.author = cap(clean(cap(c.author, 400), ""), 100);
  return r;
}
function toReportFinding(repo, root, s, chain, options, resolved) {
  const f = s.finding;
  const out = {
    repo,
    ruleId: f.ruleId,
    title: clean(f.title, root),
    severity: f.severity,
    confidence: f.confidence,
    file: f.file,
    range: f.range,
    evidence: clean(f.evidence, root),
    fix: clean(f.fix, root),
    status: resolved ? "resolved" : "open"
  };
  if (chain.length) {
    out.introducedIn = { ...commitRef(chain[s.from], options), exact: s.exact };
    if (resolved && s.to !== void 0) out.resolvedIn = commitRef(chain[s.to], options);
  }
  return out;
}
function buildReport(input) {
  const { options, now } = input;
  const analyses = input.repos.map((r) => ({ input: r, a: analyzeRepo(r, options) }));
  const months = windowMonths(now, options.months);
  const windowStart = months[0].startSec;
  const findings = [];
  for (const { input: r, a } of analyses) {
    if (a.plain) {
      for (const f of a.plain) findings.push({ repo: r.name, ruleId: f.ruleId, title: clean(f.title, r.path), severity: f.severity, confidence: f.confidence, file: f.file, range: f.range, evidence: clean(f.evidence, r.path), fix: clean(f.fix, r.path), status: "open" });
      continue;
    }
    for (const s of a.spans) {
      if (s.to === void 0) findings.push(toReportFinding(r.name, r.path, s, a.chain, options, false));
      else if (a.chain[s.to].time >= windowStart) findings.push(toReportFinding(r.name, r.path, s, a.chain, options, true));
    }
  }
  const firstTimes = analyses.filter((x) => x.a.chain.length).map((x) => x.a.chain[0].time);
  const trend = [];
  if (firstTimes.length) {
    const firstAny = Math.min(...firstTimes);
    const single = analyses.length === 1;
    for (const w of months) {
      if (firstAny >= w.endSec) continue;
      const open = emptyCounts();
      let introduced = 0, resolved = 0, asOf = null;
      for (const { a } of analyses) {
        if (!a.chain.length) continue;
        let idx = a.chain.length - 1;
        while (idx >= 0 && a.chain[idx].time >= w.endSec) idx--;
        if (idx < 0) continue;
        if (single) asOf = a.chain[idx].short;
        for (const s of a.spans) {
          if (s.from <= idx && (s.to === void 0 || idx < s.to)) open[s.finding.severity]++;
          if (s.exact) {
            const t = a.chain[s.from].time;
            if (t >= w.startSec && t < w.endSec) introduced++;
          }
          if (s.to !== void 0) {
            const t = a.chain[s.to].time;
            if (t >= w.startSec && t < w.endSec) resolved++;
          }
        }
      }
      trend.push({ month: w.month, asOfCommit: asOf, open, highCritical: open.high + open.critical, introduced, resolved });
    }
  }
  const repos = analyses.map((x) => x.a.meta);
  if (!trend.length && !analyses.some((x) => x.a.meta.notes.length)) repos[0].notes.push("no commit history in the window: the monthly trend is empty");
  return assembleReport({ repos, findings, months: trend, options, now, demo: input.demo });
}

// ../core/src/index.ts
function scanDirectory(root, opts = {}) {
  const config2 = opts.config ?? loadConfig(root);
  const { files, skipped } = discover(root, { maxFileSizeKb: config2.maxFileSizeKb });
  if (opts.userHome) {
    const u = discoverUserLevel(opts.userHome, { maxFileSizeKb: config2.maxFileSizeKb });
    files.push(...u.files);
    skipped.push(...u.skipped);
  }
  const trackedFiles = opts.trackedFiles ?? readTrackedFiles(root);
  return { ...scanFiles(files, { root, config: config2, trackedFiles, readFile: makeRepoReader(root) }), skipped };
}

// src/args.ts
var COMMANDS = ["scan", "diff", "lock", "verify", "baseline", "harden", "hook", "report"];
var UsageError = class extends Error {
};
var USAGE = `usage: tripwire <command> [args] [flags]

commands:
  scan <path>                  scan a directory for risky agent configuration
  diff <base> <head>           what <head> introduced or made worse relative to <base> (refs or SHAs, or WORKTREE)
  lock <path>                  write .tripwire.lock (hashes of MCP server definitions and hook commands)
  verify <path>                report drift against the lock (--lock-from <rev>: take the lock from that revision, not the working tree)
  baseline create <path>       accept current findings; write .tripwire-baseline.json
  harden <path>                print a recommended safe settings template (--write to create it, with confirmation)
  hook install|uninstall       install/remove a user-run git post-checkout/post-merge hook that runs scan
  report <path...>             report of findings tied to the commit that added them, with a monthly trend (html, json or md)

flags:
  --sarif <file>  --json <file>  (use - for stdout)   --fail-on <critical|high|medium|low|info|none>  (default high)
  --min-confidence <low|medium|high>  --baseline <file>  --include-user-configs  --no-color  --repo <path>
  --no-repo-config  --no-merge-base (diff)  --write (harden)  --yes (non-interactive confirmation)  --version  --help
report flags: --format <html|json|md>  --out <file>  --force  --months <1-24>  --max-commits <n>  --include-authors  --include-subjects
  --repo-name <name>  --min-severity <sev>  --demo-label  --now <ISO-8601 UTC>   (--fail-on defaults to none for report)
exit codes: 0 clean, 1 findings at/above threshold or drift, 2 tool error`;
var VALUE_FLAGS = /* @__PURE__ */ new Set(["--sarif", "--json", "--fail-on", "--min-confidence", "--baseline", "--repo", "--lock-from", "--format", "--out", "--months", "--max-commits", "--repo-name", "--min-severity", "--now"]);
var REPORT_ONLY = /* @__PURE__ */ new Set(["--format", "--out", "--months", "--max-commits", "--repo-name", "--min-severity", "--now", "--force", "--include-authors", "--include-subjects", "--demo-label"]);
var BOOL_FLAGS = /* @__PURE__ */ new Set(["--include-user-configs", "--no-color", "--no-merge-base", "--no-repo-config", "--write", "--yes", "--force", "--include-authors", "--include-subjects", "--demo-label", "--help", "--version", "-h", "-v"]);
function intFlag(flag, v, min, max) {
  if (!/^\d+$/.test(v) || Number(v) < min || Number(v) > max) throw new UsageError(`invalid ${flag} "${v}" (use an integer from ${min} to ${max})`);
  return Number(v);
}
function parseArgs(argv) {
  const out = {
    pos: [],
    failOn: "high",
    minConfidence: "low",
    includeUserConfigs: false,
    noColor: false,
    noMergeBase: false,
    noRepoConfig: false,
    write: false,
    yes: false,
    help: false,
    version: false,
    failOnGiven: false,
    format: "html",
    force: false,
    months: 6,
    maxCommits: 2e3,
    includeAuthors: false,
    includeSubjects: false,
    minSeverity: "low",
    demoLabel: false
  };
  const usedReportOnly = [];
  let minConfidenceGiven = false;
  const raw = [];
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline;
    if (a.startsWith("--") && a.includes("=")) {
      inline = a.slice(a.indexOf("=") + 1);
      a = a.slice(0, a.indexOf("="));
    }
    if (REPORT_ONLY.has(a)) usedReportOnly.push(a);
    if (a === "--min-confidence") minConfidenceGiven = true;
    if (VALUE_FLAGS.has(a)) {
      const v = inline ?? argv[++i];
      if (v === void 0 || inline === void 0 && v.startsWith("--") && v.length > 2) throw new UsageError(`missing value for ${a}`);
      switch (a) {
        case "--sarif":
          out.sarif = v;
          break;
        case "--json":
          out.json = v;
          break;
        case "--baseline":
          out.baseline = v;
          break;
        case "--repo":
          out.repo = v;
          break;
        case "--lock-from":
          out.lockFrom = v;
          break;
        case "--fail-on":
          if (v !== "none" && !SEVERITY_ORDER.includes(v)) throw new UsageError(`invalid --fail-on "${v}" (use critical, high, medium, low, info or none)`);
          out.failOn = v;
          out.failOnGiven = true;
          break;
        case "--format":
          if (v !== "html" && v !== "json" && v !== "md") throw new UsageError(`invalid --format "${v}" (use html, json or md)`);
          out.format = v;
          break;
        case "--out":
          out.out = v;
          break;
        case "--months":
          out.months = intFlag(a, v, 1, 24);
          break;
        case "--max-commits":
          out.maxCommits = intFlag(a, v, 1, 1e6);
          break;
        case "--repo-name":
          out.repoName = v;
          break;
        case "--min-severity":
          if (!SEVERITY_ORDER.includes(v)) throw new UsageError(`invalid --min-severity "${v}" (use critical, high, medium, low or info)`);
          out.minSeverity = v;
          break;
        case "--now":
          if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v) || Number.isNaN(Date.parse(v))) throw new UsageError(`invalid --now "${v}" (use an ISO-8601 UTC time such as 2026-10-20T00:00:00Z)`);
          out.now = v;
          break;
        case "--min-confidence":
          if (!["low", "medium", "high"].includes(v)) throw new UsageError(`invalid --min-confidence "${v}" (use low, medium or high)`);
          out.minConfidence = v;
          break;
      }
    } else if (BOOL_FLAGS.has(a)) {
      if (inline !== void 0) throw new UsageError(`${a} does not take a value`);
      switch (a) {
        case "--include-user-configs":
          out.includeUserConfigs = true;
          break;
        case "--no-color":
          out.noColor = true;
          break;
        case "--no-merge-base":
          out.noMergeBase = true;
          break;
        case "--no-repo-config":
          out.noRepoConfig = true;
          break;
        case "--write":
          out.write = true;
          break;
        case "--yes":
          out.yes = true;
          break;
        case "--force":
          out.force = true;
          break;
        case "--include-authors":
          out.includeAuthors = true;
          break;
        case "--include-subjects":
          out.includeSubjects = true;
          break;
        case "--demo-label":
          out.demoLabel = true;
          break;
        case "--help":
        case "-h":
          out.help = true;
          break;
        case "--version":
        case "-v":
          out.version = true;
          break;
      }
    } else if (a.startsWith("-") && a.length > 1) {
      throw new UsageError(`unknown flag ${a}`);
    } else raw.push(argv[i]);
  }
  if (out.help || out.version) return out;
  const cmd = raw.shift();
  if (cmd === void 0) throw new UsageError("missing command");
  if (!COMMANDS.includes(cmd)) throw new UsageError(`unknown command "${cmd}"`);
  out.command = cmd;
  out.pos = raw;
  const need = (ok, msg) => {
    if (!ok) throw new UsageError(msg);
  };
  switch (out.command) {
    case "diff":
      need(raw.length === 2, "diff needs exactly <base> and <head>");
      break;
    case "baseline":
      need(raw[0] === "create" && raw.length <= 2, "baseline needs the subcommand: baseline create [path]");
      break;
    case "hook":
      need((raw[0] === "install" || raw[0] === "uninstall") && raw.length <= 2, "hook needs install or uninstall [path]");
      break;
    case "report":
      need(raw.length >= 1, "report needs at least one <path>");
      need(!(out.repoName !== void 0 && raw.length > 1), "--repo-name needs exactly one <path>");
      need(out.sarif === void 0 && out.json === void 0 && out.baseline === void 0 && !minConfidenceGiven, "report does not take --sarif, --json, --baseline or --min-confidence (use --format and --out)");
      break;
    default:
      need(raw.length <= 1, `${out.command} takes at most one <path>`);
  }
  if (out.lockFrom !== void 0 && out.command !== "verify") throw new UsageError("--lock-from is only valid with verify");
  if (out.command !== "report" && usedReportOnly.length) throw new UsageError(`${usedReportOnly[0]} is only valid with report`);
  if (out.sarif === "-" && out.json === "-") throw new UsageError("--sarif and --json cannot both write to stdout");
  return out;
}

// src/hook.ts
import { chmodSync, existsSync as existsSync5, lstatSync as lstatSync5, mkdirSync, readFileSync as readFileSync6, unlinkSync, writeFileSync } from "node:fs";
import { dirname as dirname2, isAbsolute as isAbsolute2, join as join6, resolve as resolve3 } from "node:path";
var HOOK_NAMES = ["post-checkout", "post-merge"];
var MARKER = `# ${PRODUCT.id.toUpperCase()}-MANAGED-HOOK v1`;
var HookRefusal = class extends Error {
};
var readText = (p) => {
  try {
    return readFileSync6(p, "utf8");
  } catch {
    return void 0;
  }
};
function findGitDirs(root) {
  const dotGit = join6(root, ".git");
  let st;
  try {
    st = lstatSync5(dotGit);
  } catch {
    throw new HookRefusal(`${root} is not a git repository (no .git)`);
  }
  let gitDir;
  if (st.isSymbolicLink()) throw new HookRefusal(".git is a symbolic link; refusing to manage hooks through it");
  if (st.isDirectory()) gitDir = dotGit;
  else {
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(readText(dotGit) ?? "");
    if (!m) throw new HookRefusal(".git is a file but does not contain a gitdir: line");
    gitDir = resolve3(root, m[1]);
  }
  let commonDir = gitDir;
  const common = readText(join6(gitDir, "commondir"))?.trim();
  if (common) commonDir = resolve3(gitDir, common);
  return { gitDir, commonDir, hooksDir: join6(commonDir, "hooks") };
}
function configSetsHooksPath(text2) {
  let inCore = false;
  for (const raw of text2.split(/\r?\n/)) {
    const line = raw.trim();
    const sec = /^\[\s*([A-Za-z0-9.-]+)(?:\s+"[^"]*")?\s*\]/.exec(line);
    if (sec) {
      inCore = sec[1].toLowerCase() === "core";
      const rest = line.slice(sec[0].length).trim();
      if (inCore && /^hookspath\s*=/i.test(rest)) return true;
      continue;
    }
    if (inCore && /^hookspath\s*(=|$)/i.test(line)) return true;
  }
  return false;
}
function includePaths(text2, baseDir, home) {
  const out = [];
  let inInclude = false;
  for (const raw of text2.split(/\r?\n/)) {
    const line = raw.trim();
    const sec = /^\[\s*(include|includeIf)\b/i.exec(line);
    if (sec) {
      inInclude = true;
      continue;
    }
    if (line.startsWith("[")) {
      inInclude = false;
      continue;
    }
    const m = inInclude ? /^path\s*=\s*(.+)$/i.exec(line) : null;
    if (m) {
      let p = m[1].trim().replace(/^"|"$/g, "");
      if (p.startsWith("~/") && home) p = join6(home, p.slice(2));
      out.push(isAbsolute2(p) ? p : resolve3(baseDir, p));
    }
  }
  return out;
}
function findHooksPathRedirect(dirs, env, home) {
  const seen = /* @__PURE__ */ new Set();
  const check = (file, depth) => {
    if (seen.has(file) || depth > 3) return void 0;
    seen.add(file);
    const text2 = readText(file);
    if (text2 === void 0) return void 0;
    if (configSetsHooksPath(text2)) return file;
    for (const inc of includePaths(text2, dirname2(file), home)) {
      const r = check(inc, depth + 1);
      if (r) return r;
    }
    return void 0;
  };
  const xdg = env.XDG_CONFIG_HOME || (home ? join6(home, ".config") : "");
  const candidates = [
    join6(dirs.commonDir, "config"),
    join6(dirs.gitDir, "config"),
    join6(dirs.gitDir, "config.worktree"),
    ...home ? [join6(home, ".gitconfig")] : [],
    ...xdg ? [join6(xdg, "git", "config")] : [],
    "/etc/gitconfig",
    ...env.ProgramFiles ? [join6(env.ProgramFiles, "Git", "etc", "gitconfig")] : []
  ];
  for (const c of candidates) {
    const r = check(c, 0);
    if (r) return r;
  }
  if (env.GIT_CONFIG_COUNT || env.GIT_CONFIG_PARAMETERS) {
    const p = env.GIT_CONFIG_PARAMETERS ?? "";
    if (/hookspath/i.test(p) || [...Array(Number(env.GIT_CONFIG_COUNT) || 0).keys()].some((i) => /^core\.hookspath$/i.test(env[`GIT_CONFIG_KEY_${i}`] ?? ""))) return "environment (GIT_CONFIG_*)";
  }
  return void 0;
}
var shq = (s) => {
  if (/[\0\r\n]/.test(s)) throw new HookRefusal("a path contains a control character; refusing to write it into a shell script");
  return `'${s.replace(/\\/g, "/").replace(/'/g, `'\\''`)}'`;
};
function hookScript(name, selfPath, repoRoot2) {
  return [
    "#!/bin/sh",
    MARKER,
    `# ${PRODUCT.name} ${name} hook. Installed by \`${PRODUCT.id} hook install\`; remove with \`${PRODUCT.id} hook uninstall\`.`,
    "# It scans the agent configuration of this repository (read-only) and prints a warning. It never blocks git and always exits 0.",
    "if command -v node >/dev/null 2>&1; then",
    `  node ${shq(selfPath)} scan ${shq(repoRoot2)} --no-color --fail-on high >&2 || echo "${PRODUCT.id}: the scan above reported findings (or could not run). This hook only warns." >&2`,
    "fi",
    "exit 0",
    ""
  ].join("\n");
}
function hookState(file) {
  let st;
  try {
    st = lstatSync5(file);
  } catch {
    return "absent";
  }
  if (st.isSymbolicLink()) return "symlink";
  const text2 = readText(file) ?? "";
  return text2.includes(MARKER) ? "ours" : "foreign";
}
function planInstall(root, env, home) {
  const dirs = findGitDirs(root);
  const redirect = findHooksPathRedirect(dirs, env, home);
  if (redirect) throw new HookRefusal(`git configuration sets core.hooksPath (${redirect}); hooks run from a redirected directory, which may be shared or controlled by someone else. Refusing to install.`);
  if (existsSync5(dirs.hooksDir)) {
    const st = lstatSync5(dirs.hooksDir);
    if (st.isSymbolicLink()) throw new HookRefusal("the hooks directory is a symbolic link; refusing to write through it");
    if (!st.isDirectory()) throw new HookRefusal("the hooks path exists and is not a directory");
  }
  const actions = [];
  for (const name of HOOK_NAMES) {
    const file = join6(dirs.hooksDir, name);
    const state = hookState(file);
    if (state === "foreign") throw new HookRefusal(`${name} already exists and was not created by ${PRODUCT.name}; it is never overwritten. Add a line to it by hand that runs: ${PRODUCT.id} scan .`);
    if (state === "symlink") throw new HookRefusal(`${name} is a symbolic link; refusing to replace it`);
    actions.push({ name, file, kind: state === "ours" ? "update" : "create" });
  }
  return { dirs, actions };
}
function applyInstall(plan, selfPath, repoRoot2) {
  const scripts = plan.actions.map((a) => ({ a, text: hookScript(a.name, selfPath, repoRoot2) }));
  if (!existsSync5(plan.dirs.hooksDir)) mkdirSync(plan.dirs.hooksDir, { recursive: true });
  for (const { a, text: text2 } of scripts) {
    writeFileSync(a.file, text2, a.kind === "create" ? { flag: "wx", mode: 493 } : { mode: 493 });
    try {
      chmodSync(a.file, 493);
    } catch {
    }
  }
}
function uninstall(root) {
  const dirs = findGitDirs(root);
  const res = { removed: [], left: [], absent: [] };
  for (const name of HOOK_NAMES) {
    const file = join6(dirs.hooksDir, name);
    const state = hookState(file);
    if (state === "ours") {
      unlinkSync(file);
      res.removed.push(name);
    } else if (state === "absent") res.absent.push(name);
    else res.left.push(name);
  }
  return res;
}

// src/harden.ts
import { lstatSync as lstatSync6, mkdirSync as mkdirSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join7 } from "node:path";
var SECRET_DENY_RULES = [
  "Read(./.env)",
  "Read(./.env.*)",
  "Read(./secrets/**)",
  "Read(~/.ssh/**)",
  "Read(~/.aws/**)",
  "Read(~/.config/gcloud/**)"
];
function projectTemplate() {
  return {
    permissions: { deny: [...SECRET_DENY_RULES], disableBypassPermissionsMode: "disable" },
    enableAllProjectMcpServers: false,
    disableSkillShellExecution: true
  };
}
function managedTemplate() {
  return {
    permissions: { deny: [...SECRET_DENY_RULES], disableBypassPermissionsMode: "disable" },
    enableAllProjectMcpServers: false,
    disableSkillShellExecution: true,
    allowManagedHooksOnly: true,
    allowManagedPermissionRulesOnly: true,
    allowManagedMcpServersOnly: true,
    allowedMcpServers: []
  };
}
var MANAGED_PATHS = {
  macOS: "/Library/Application Support/ClaudeCode/managed-settings.json",
  "Linux and WSL": "/etc/claude-code/managed-settings.json",
  Windows: "C:\\Program Files\\ClaudeCode\\managed-settings.json"
};
var PROJECT_FILE = ".claude/settings.json";
var j = (v) => JSON.stringify(v, null, 2);
function hardenText() {
  return [
    "# Recommended settings (flags nothing by itself; nothing was written)",
    "",
    `## 1. Settings file (${PROJECT_FILE}, or ~/.claude/settings.json for all your projects)`,
    j(projectTemplate()),
    "",
    "- permissions.deny blocks the agent's file tools from reading secret paths. Deny rules are checked before ask and allow rules.",
    '- permissions.disableBypassPermissionsMode: "disable" stops bypassPermissions from being used (documented to work from any settings file).',
    "- enableAllProjectMcpServers: false keeps every project MCP server behind its own approval.",
    "- disableSkillShellExecution: true stops skills from running their !`command` blocks when invoked.",
    "- Do not set permissions.defaultMode to bypassPermissions or auto: Claude Code ignores those values in project and local settings, and they weaken your own sessions.",
    "- A file inside a repository is written by whoever controls the repository. These settings protect you best in your user settings or in managed settings (section 2).",
    "",
    "## 2. Managed settings snippet (organization-wide; users and projects cannot override it)",
    j(managedTemplate()),
    "",
    ...Object.entries(MANAGED_PATHS).map(([os, p]) => `- ${os}: ${p}`),
    "- allowManagedHooksOnly: only hooks from managed settings run. allowManagedPermissionRulesOnly: only managed allow/ask/deny rules apply. allowManagedMcpServersOnly: only the managed allowedMcpServers list decides which MCP servers load.",
    "- allowedMcpServers is left empty on purpose. Its entry format and the meaning of an empty list were NOT verified by this tool: read https://code.claude.com/docs/en/settings-reference before relying on it.",
    "",
    "## 3. Hooks guidance",
    "- Review every hook command in shared settings the way you review code: it runs with your privileges, without a prompt, from a file the repository controls.",
    "- Prefer allowManagedHooksOnly in managed settings. For a single project, remove hooks you did not write; disableAllHooks turns hooks off for your own sessions.",
    `- Pin MCP servers to exact versions, and run \`${PRODUCT.id} lock\` / \`${PRODUCT.id} verify\` to notice when a server or hook definition changes.`,
    "",
    `To create ${PROJECT_FILE} from section 1: ${PRODUCT.id} harden <path> --write  (asks for confirmation; never overwrites an existing file).`
  ].join("\n");
}
function writeProjectTemplate(root) {
  const dir = join7(root, ".claude");
  const file = join7(root, PROJECT_FILE);
  try {
    let st = void 0;
    try {
      st = lstatSync6(dir);
    } catch {
    }
    if (st) {
      if (st.isSymbolicLink()) return { ok: false, reason: ".claude is a symbolic link; refusing to write through it" };
      if (!st.isDirectory()) return { ok: false, reason: ".claude exists and is not a directory" };
    }
    let fst = void 0;
    try {
      fst = lstatSync6(file);
    } catch {
    }
    if (fst) return { ok: false, reason: `${PROJECT_FILE} already exists; nothing was written. Merge section 1 into it by hand.` };
    if (!st) mkdirSync2(dir);
    writeFileSync2(file, j(projectTemplate()) + "\n", { flag: "wx" });
    return { ok: true, file: PROJECT_FILE };
  } catch (e) {
    return { ok: false, reason: `cannot write ${PROJECT_FILE}: ${e.message}` };
  }
}

// src/io.ts
import { createInterface } from "node:readline";
var CliError = class extends Error {
};
function processIO() {
  const canPrompt = !!process.stdin.isTTY && !!process.stderr.isTTY;
  return {
    cwd: process.cwd(),
    env: process.env,
    homedir: process.env.USERPROFILE || process.env.HOME || "",
    selfPath: process.argv[1] ?? "",
    stdout: (s) => {
      process.stdout.write(s);
    },
    stderr: (s) => {
      process.stderr.write(s);
    },
    stdoutIsTTY: !!process.stdout.isTTY,
    canPrompt,
    ask: (q) => new Promise((resolve7) => {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      rl.question(q + " [y/N] ", (ans) => {
        rl.close();
        resolve7(/^y(es)?$/i.test(ans.trim()));
      });
    })
  };
}
async function confirm(io, yes, question) {
  if (yes) return true;
  if (!io.canPrompt) return false;
  return io.ask(question);
}

// src/reportCmd.ts
import { closeSync as closeSync2, lstatSync as lstatSync7, openSync as openSync2, realpathSync as realpathSync2, renameSync, unlinkSync as unlinkSync2, writeSync } from "node:fs";
import { basename as basename2, dirname as dirname3, isAbsolute as isAbsolute3, join as join8, relative, resolve as resolve5 } from "node:path";

// src/report.ts
import { statSync, writeFileSync as writeFileSync3 } from "node:fs";
import { resolve as resolve4 } from "node:path";
var confRank3 = { low: 0, medium: 1, high: 2 };
var passesConfidence = (f, min) => confRank3[f.confidence] >= confRank3[min];
function exceeds(findings, failOn) {
  if (failOn === "none") return false;
  const t = sevRank(failOn);
  return findings.some((f) => sevRank(f.severity) >= t);
}
function requireDir(io, p, what = "path") {
  const abs = resolve4(io.cwd, p);
  let st;
  try {
    st = statSync(abs);
  } catch {
    throw new CliError(`${what} not found: ${p}`);
  }
  if (!st.isDirectory()) throw new CliError(`${what} must be a directory: ${p}`);
  return abs;
}
function summaryLine(o) {
  const c = countBySeverity(o.findings);
  const parts = ["critical", "high", "medium", "low", "info"].filter((s) => c[s]).map((s) => `${c[s]} ${s}`);
  const n = o.findings.length;
  let line = `${n} finding${n === 1 ? "" : "s"}${parts.length ? ` (${parts.join(", ")})` : ""}`;
  if (o.suppressedByBaseline) line += `; ${o.suppressedByBaseline} suppressed by baseline`;
  if (o.suppressedByConfig) line += `; ${o.suppressedByConfig} suppressed by ${PRODUCT.configFile}`;
  return line;
}
function buildJson(a, o, failed) {
  return {
    schemaVersion: 1,
    tool: { name: PRODUCT.name, version: TOOL_VERSION },
    command: o.command,
    root: o.root,
    summary: {
      total: o.findings.length,
      bySeverity: countBySeverity(o.findings),
      suppressedByBaseline: o.suppressedByBaseline,
      suppressedByConfig: o.suppressedByConfig,
      failOn: a.failOn,
      minConfidence: a.minConfidence,
      failed
    },
    findings: o.findings,
    ...o.extra ?? {}
  };
}
function buildSarif(o) {
  const log = toSarif({ findings: o.findings, baselineStates: o.baselineStates });
  log.runs[0].properties = { suppressedByBaseline: o.suppressedByBaseline };
  return log;
}
function writeTarget(io, target, text2) {
  if (target === "-") {
    io.stdout(text2);
    return true;
  }
  try {
    writeFileSync3(resolve4(io.cwd, target), text2);
  } catch (e) {
    throw new CliError(`cannot write ${target}: ${e.message}`);
  }
  return false;
}
function finish2(io, a, o) {
  const failed = !!o.forceFail || exceeds(o.findings, a.failOn);
  const json = a.json ? JSON.stringify(buildJson(a, o, failed), null, 2) + "\n" : void 0;
  const sarif = a.sarif && (o.command === "scan" || o.command === "diff" || o.command === "verify") ? JSON.stringify(buildSarif(o), null, 2) + "\n" : void 0;
  let textToStderr = false;
  if (json !== void 0 && writeTarget(io, a.json, json)) textToStderr = true;
  if (sarif !== void 0 && writeTarget(io, a.sarif, sarif)) textToStderr = true;
  const out = textToStderr ? io.stderr : io.stdout;
  const color = !a.noColor && !io.env.NO_COLOR && io.stdoutIsTTY && !textToStderr;
  const body = o.command === "baseline" || o.command === "lock" ? "" : toTextReport(o.findings, { color });
  const lines = [...body ? [body, ""] : [], ...o.notes ?? [], summaryLine(o)];
  out(lines.join("\n") + "\n");
  return failed ? 1 : 0;
}

// src/reportCmd.ts
var EXT = { html: "html", json: "json", md: "md" };
var norm4 = (p) => process.platform === "win32" ? p.toLowerCase() : p;
var inside = (root, p) => {
  const rel = relative(norm4(root), norm4(p));
  return rel === "" || !rel.startsWith("..") && !isAbsolute3(rel);
};
function safeOutPath(io, out, force) {
  const cwdReal = realpathSync2(io.cwd);
  const target = resolve5(io.cwd, out);
  if (!inside(resolve5(io.cwd), target)) throw new CliError(`refusing --out ${out}: it is outside the current folder`);
  let parentReal;
  try {
    parentReal = realpathSync2(dirname3(target));
  } catch {
    throw new CliError(`cannot write ${out}: the folder does not exist`);
  }
  if (!inside(cwdReal, parentReal)) throw new CliError(`refusing --out ${out}: its folder resolves outside the current folder (symbolic link or junction)`);
  const real = join8(parentReal, basename2(target));
  let st;
  try {
    st = lstatSync7(real);
  } catch {
    return real;
  }
  if (st.isSymbolicLink()) {
    let dest;
    try {
      dest = realpathSync2(real);
    } catch {
      throw new CliError(`refusing --out ${out}: it is a broken symbolic link`);
    }
    if (!inside(cwdReal, dest)) throw new CliError(`refusing --out ${out}: it is a symbolic link that leads outside the current folder`);
  }
  if (st.isDirectory()) throw new CliError(`cannot write ${out}: it is a folder`);
  if (!force) throw new CliError(`${out} already exists (use --force to overwrite)`);
  return real;
}
function writeAtomic(path, data) {
  const tmp = `${path}.tmp-${process.pid}`;
  let fd;
  try {
    fd = openSync2(tmp, "wx");
    writeSync(fd, data);
    closeSync2(fd);
    fd = void 0;
    renameSync(tmp, path);
  } catch (e) {
    if (fd !== void 0) try {
      closeSync2(fd);
    } catch {
    }
    try {
      unlinkSync2(tmp);
    } catch {
    }
    throw new CliError(`cannot write ${basename2(path)}: ${e.message}`);
  }
}
function displayNames(a, roots) {
  if (a.repoName !== void 0) return [a.repoName];
  const seen = /* @__PURE__ */ new Map();
  return roots.map((r) => {
    const base = basename2(r) || "repository";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}
function reportOptions(a) {
  return {
    months: a.months,
    maxCommits: a.maxCommits,
    includeAuthors: a.includeAuthors,
    includeSubjects: a.includeSubjects,
    minSeverity: a.minSeverity,
    failOn: a.failOn,
    repoConfig: !a.noRepoConfig
  };
}
async function cmdReport(io, a) {
  const roots = a.pos.map((p) => requireDir(io, p, "path"));
  const options = reportOptions({ ...a, failOn: a.failOnGiven ? a.failOn : "none" });
  const outTarget = a.out === "-" ? void 0 : safeOutPath(io, a.out ?? `${PRODUCT.id}-report.${EXT[a.format]}`, a.force);
  const names2 = displayNames(a, roots);
  const now = a.now ? new Date(a.now) : /* @__PURE__ */ new Date();
  let data;
  try {
    data = buildReport({ repos: roots.map((r, i) => ({ path: r, name: names2[i] })), options, now, demo: a.demoLabel });
  } catch (e) {
    if (e instanceof GitError) throw new CliError(e.message);
    throw e;
  }
  const body = a.format === "json" ? renderJson(data) : a.format === "md" ? renderMarkdown(data) : renderHtml(data);
  let toStderr = false;
  if (outTarget === void 0) {
    io.stdout(body);
    toStderr = true;
  } else writeAtomic(outTarget, body);
  const say = toStderr ? io.stderr : io.stdout;
  const s = data.summary;
  say(`${outTarget ? `Wrote ${a.out ?? basename2(outTarget)}: ` : ""}${s.open} open finding${s.open === 1 ? "" : "s"} (${s.highCritical} high/critical), ${s.resolved} resolved, across ${roots.length} repositor${roots.length === 1 ? "y" : "ies"}
`);
  const failed = options.failOn !== "none" && data.findings.some((f) => f.status === "open" && sevRank(f.severity) >= sevRank(options.failOn));
  return failed ? 1 : 0;
}

// src/main.ts
function config(io, a, root) {
  if (a.noRepoConfig) return {};
  return loadConfig(root, { onNote: (m) => io.stderr(`${PRODUCT.name}: ${m}` + String.fromCharCode(10)) });
}
function repoRoot(io, a, fallback) {
  return requireDir(io, a.repo ?? fallback, a.repo ? "--repo" : "path");
}
function baselineLocation(io, a, root) {
  if (!a.baseline) return void 0;
  const abs = resolve6(io.cwd, a.baseline);
  const rel = relative2(resolve6(root), abs).split(sep2).join("/");
  return { abs, rel, inRepo: !!rel && !rel.startsWith("..") && !isAbsolute4(rel) };
}
function withBaseline(io, a, findings, root, fromBase) {
  const loc = baselineLocation(io, a, root);
  if (!loc) return { kept: findings, suppressedByBaseline: 0, notes: [] };
  if (loc.inRepo && a.noRepoConfig) return { kept: findings, suppressedByBaseline: 0, notes: [`ignored baseline ${a.baseline}: it is inside the repository and --no-repo-config was given`] };
  let text2;
  const notes = [];
  if (fromBase && loc.inRepo) {
    text2 = fromBase.baseFiles[loc.rel];
    if (text2 === void 0) return { kept: findings, suppressedByBaseline: 0, notes: [`baseline ${loc.rel} does not exist at the base revision (${fromBase.commit.slice(0, 8)}); no baseline applied. A baseline added by the change itself is never trusted.`] };
    notes.push(`baseline ${loc.rel} read from the base revision ${fromBase.commit.slice(0, 8)}, not from the head`);
  } else {
    try {
      text2 = readFileSync7(loc.abs, "utf8");
    } catch {
      throw new CliError(`cannot read baseline file: ${a.baseline}`);
    }
  }
  let b;
  try {
    b = parseBaseline(text2);
  } catch (e) {
    if (e instanceof BaselineError) throw new CliError(`${a.baseline}: ${e.message}`);
    throw e;
  }
  const r = applyBaseline(findings, b);
  if (r.stale) notes.push(`${r.stale} baseline entr${r.stale === 1 ? "y" : "ies"} no longer match anything (fixed or changed)`);
  return { kept: r.kept, suppressedByBaseline: r.suppressed.length, notes };
}
var shownRoot = (a, fallback) => a.repo ?? fallback;
async function cmdScan(io, a) {
  const given = a.pos[0] ?? ".";
  const root = repoRoot(io, a, given);
  const cfg = config(io, a, root);
  const res = scanDirectory(root, { config: cfg, userHome: a.includeUserConfigs && io.homedir ? io.homedir : void 0 });
  for (const m of res.invalidSuppressions) io.stderr(`${PRODUCT.name}: ${m}
`);
  const filtered = res.findings.filter((f) => passesConfidence(f, a.minConfidence));
  const b = withBaseline(io, a, filtered, root);
  const o = { command: "scan", root: shownRoot(a, given), findings: b.kept, suppressedByConfig: res.suppressed.length, suppressedByBaseline: b.suppressedByBaseline, notes: b.notes };
  return finish2(io, a, o);
}
async function cmdBaselineCreate(io, a) {
  const given = a.pos[1] ?? ".";
  const root = repoRoot(io, a, given);
  const cfg = config(io, a, root);
  const res = scanDirectory(root, { config: cfg, userHome: a.includeUserConfigs && io.homedir ? io.homedir : void 0 });
  const findings = res.findings.filter((f) => passesConfidence(f, a.minConfidence));
  const file = join9(root, BASELINE_FILE);
  try {
    writeFileSync4(file, serializeBaseline(createBaseline(findings)));
  } catch (e) {
    throw new CliError(`cannot write ${BASELINE_FILE}: ${e.message}`);
  }
  const o = {
    command: "baseline",
    root: shownRoot(a, given),
    findings: [],
    suppressedByConfig: res.suppressed.length,
    suppressedByBaseline: 0,
    extra: { baseline: { file: BASELINE_FILE, accepted: findings.length } },
    notes: [`Wrote ${BASELINE_FILE}: accepted ${findings.length} finding${findings.length === 1 ? "" : "s"}. Later runs with --baseline ${BASELINE_FILE} fail only on new ones.`]
  };
  return finish2(io, a, o);
}
function discoverAll(io, a, root) {
  const cfg = config(io, a, root);
  const { files } = discover(root, { maxFileSizeKb: cfg.maxFileSizeKb });
  if (a.includeUserConfigs && io.homedir) files.push(...discoverUserLevel(io.homedir, { maxFileSizeKb: cfg.maxFileSizeKb }).files);
  return files;
}
function readLock(io, root) {
  const file = join9(root, LOCK_FILE);
  let text2;
  try {
    text2 = readFileSync7(file, "utf8");
  } catch {
    throw new CliError(`no lock file at ${LOCK_FILE} (create one with: ${PRODUCT.id} lock <path>)`);
  }
  try {
    return parseLock(text2);
  } catch (e) {
    if (e instanceof LockError) throw new CliError(`${LOCK_FILE}: ${e.message}`);
    throw e;
  }
}
async function cmdLock(io, a) {
  const given = a.pos[0] ?? ".";
  const root = repoRoot(io, a, given);
  const files = discoverAll(io, a, root);
  const lock = createLock(files);
  let drift = { changed: 0, added: 0, removed: 0 };
  let hadLock = false;
  try {
    const prev = parseLock(readFileSync7(join9(root, LOCK_FILE), "utf8"));
    hadLock = true;
    drift = verifyLock(prev, files).counts;
  } catch {
  }
  try {
    writeFileSync4(join9(root, LOCK_FILE), serializeLock(lock));
  } catch (e) {
    throw new CliError(`cannot write ${LOCK_FILE}: ${e.message}`);
  }
  const changes = drift.changed + drift.added + drift.removed;
  const o = {
    command: "lock",
    root: shownRoot(a, given),
    findings: [],
    suppressedByConfig: 0,
    suppressedByBaseline: 0,
    extra: { lock: { file: LOCK_FILE, entries: lock.entries.length, drift } },
    notes: [`Wrote ${LOCK_FILE}: ${lock.entries.length} entr${lock.entries.length === 1 ? "y" : "ies"} (MCP servers and hook commands).` + (hadLock ? changes ? ` Accepted ${drift.changed} changed, ${drift.added} added, ${drift.removed} removed.` : " No differences from the previous lock." : "")]
  };
  return finish2(io, a, o);
}
async function cmdVerify(io, a) {
  const given = a.pos[0] ?? ".";
  const root = repoRoot(io, a, given);
  const notes = [];
  let lock;
  if (a.lockFrom !== void 0) {
    let rf;
    try {
      rf = readFileAtRevision(root, a.lockFrom, LOCK_FILE, { useMergeBase: !a.noMergeBase });
    } catch (e) {
      if (e instanceof GitError) throw new CliError(e.message);
      throw e;
    }
    if (rf.text === void 0) throw new CliError(`no lock file ${LOCK_FILE} at ${a.lockFrom} (${rf.commit.slice(0, 8)}); nothing to verify against. A lock added by the change itself is never trusted: create it on the base branch first`);
    try {
      lock = parseLock(rf.text);
    } catch (e) {
      if (e instanceof LockError) throw new CliError(`${LOCK_FILE} at ${a.lockFrom}: ${e.message}`);
      throw e;
    }
    notes.push(...rf.notes, `lock read from the base revision ${rf.commit.slice(0, 8)}, not from the working tree`);
  } else lock = readLock(io, root);
  const files = discoverAll(io, a, root);
  const v = verifyLock(lock, files);
  const b = withBaseline(io, a, v.findings.filter((f) => passesConfidence(f, a.minConfidence)), root);
  const o = {
    command: "verify",
    root: shownRoot(a, given),
    findings: b.kept,
    suppressedByConfig: 0,
    suppressedByBaseline: b.suppressedByBaseline,
    forceFail: b.kept.length > 0,
    notes: [...notes, ...b.notes],
    extra: { lock: { file: LOCK_FILE, entries: v.entries, drift: v.counts } }
  };
  return finish2(io, a, o);
}
async function cmdHarden(io, a) {
  const root = repoRoot(io, a, a.pos[0] ?? ".");
  io.stdout(hardenText() + String.fromCharCode(10));
  if (!a.write) return 0;
  const ok = await confirm(io, a.yes, `Create .claude/settings.json in ${root} with the recommended project settings?`);
  if (!ok) throw new CliError("not written: confirmation was not given (answer y at the prompt, or pass --yes when running non-interactively)");
  const r = writeProjectTemplate(root);
  if (!r.ok) throw new CliError(r.reason);
  io.stdout(`Wrote ${r.file}` + String.fromCharCode(10));
  return 0;
}
async function cmdHook(io, a) {
  const root = repoRoot(io, a, a.pos[1] ?? ".");
  try {
    if (a.pos[0] === "uninstall") {
      const r = uninstall(root);
      for (const n of r.removed) io.stdout(`Removed ${n}` + String.fromCharCode(10));
      for (const n of r.left) io.stdout(`Left ${n} alone: it was not created by ${PRODUCT.name}` + String.fromCharCode(10));
      if (!r.removed.length && !r.left.length) io.stdout("No hooks installed by " + PRODUCT.name + String.fromCharCode(10));
      return 0;
    }
    const plan = planInstall(root, io.env, io.homedir);
    if (!io.selfPath) throw new CliError("cannot determine the path of this program to write into the hook");
    const names2 = plan.actions.map((x) => x.name).join(" and ");
    const ok = await confirm(io, a.yes, `Install git ${names2} hooks in ${plan.dirs.hooksDir} that run "${PRODUCT.id} scan" and print a warning (they never block git)?`);
    if (!ok) throw new CliError("not installed: confirmation was not given (answer y at the prompt, or pass --yes when running non-interactively)");
    applyInstall(plan, io.selfPath, root);
    for (const x of plan.actions) io.stdout(`${x.kind === "create" ? "Installed" : "Updated"} ${x.name}` + String.fromCharCode(10));
    io.stdout(`Remove with: ${PRODUCT.id} hook uninstall` + String.fromCharCode(10));
    return 0;
  } catch (e) {
    if (e instanceof HookRefusal) throw new CliError(e.message);
    throw e;
  }
}
async function cmdDiff(io, a) {
  const [base, head] = a.pos;
  const root = repoRoot(io, a, ".");
  const loc = baselineLocation(io, a, root);
  let out;
  try {
    out = diffAgainst(root, base, {
      headRev: head === "WORKTREE" ? void 0 : head,
      useMergeBase: !a.noMergeBase,
      configFrom: a.noRepoConfig ? "none" : "base",
      baseFiles: loc?.inRepo && !a.noRepoConfig ? [loc.rel] : []
    });
  } catch (e) {
    if (e instanceof GitError) throw new CliError(e.message);
    throw e;
  }
  const r = out.result;
  const b = withBaseline(io, a, changedFindings(r).filter((f) => passesConfidence(f, a.minConfidence)), root, { baseFiles: out.baseFiles, commit: out.comparedCommit });
  const changed = b.kept;
  const states = new Map(changed.map((f) => [f, "new"]));
  const cfgNote = a.noRepoConfig ? [] : out.configSource?.file ? [`configuration (${out.configSource.file}) read from the base revision ${out.comparedCommit.slice(0, 8)}, not from the head`] : [];
  const o = {
    command: "diff",
    root: shownRoot(a, "."),
    findings: changed,
    suppressedByConfig: 0,
    suppressedByBaseline: b.suppressedByBaseline,
    baselineStates: states,
    notes: [...out.notes, ...cfgNote, ...b.notes],
    extra: { diff: { base: r.base, head: r.head, introduced: r.introduced.length, worsened: r.worsened.length, resolved: r.resolved.length, unchanged: r.unchanged.length } }
  };
  return finish2(io, a, o);
}
async function run(argv, io) {
  try {
    const a = parseArgs(argv);
    if (a.version) {
      io.stdout(`${TOOL_VERSION}
`);
      return 0;
    }
    if (a.help) {
      io.stdout(USAGE + "\n");
      return 0;
    }
    switch (a.command) {
      case "scan":
        return await cmdScan(io, a);
      case "diff":
        return await cmdDiff(io, a);
      case "baseline":
        return await cmdBaselineCreate(io, a);
      case "harden":
        return await cmdHarden(io, a);
      case "hook":
        return await cmdHook(io, a);
      case "lock":
        return await cmdLock(io, a);
      case "verify":
        return await cmdVerify(io, a);
      case "report":
        return await cmdReport(io, a);
      default:
        throw new CliError(`${a.command} is not implemented yet`);
    }
  } catch (e) {
    if (e instanceof UsageError) {
      io.stderr(`${PRODUCT.name}: ${e.message}
${USAGE}
`);
      return 2;
    }
    if (e instanceof CliError || e instanceof GitError) {
      io.stderr(`${PRODUCT.name}: ${e.message}
`);
      return 2;
    }
    io.stderr(`${PRODUCT.name}: unexpected error: ${e.message}
`);
    return 2;
  }
}

// src/bin.ts
run(process.argv.slice(2), processIO()).then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    process.stderr.write(`unexpected error: ${e.message}
`);
    process.exitCode = 2;
  }
);
