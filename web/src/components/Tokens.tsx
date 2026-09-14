import type { Token } from "@teddy-pe/core";

// A day's instructions arrive as a flat array of these, deliberately, so
// the Phase 4 native app can render the same words without an HTML parser
// (see core/src/types.ts on Token). That only holds if this file actually
// renders off the array: reassembling tokens into a markup string and then
// styling the string would work here and be useless in React Native, which
// is the whole point core/ exists for.
//
// `type` is a plain string off the API, not a closed union, so there is no
// "every type this file knows about" to exhaustively switch on. Only
// "drill" gets its own treatment, because it is the one type that needs to
// be tappable and carry a slug (into the Glossary, Task 7). Every other
// type, including one this file has never seen, still gets its text on
// screen: a renderer that dropped what it did not recognise would lose a
// day's real instructions the first time the API added a token type, and
// nothing would report it.

function tokenClassName(token: Token): string {
  return `token token--${token.style}`;
}

function TokenItem({ token }: { token: Token }) {
  if (token.type === "drill") {
    return (
      <button type="button" className={`${tokenClassName(token)} token--drill`} data-slug={token.slug}>
        {token.text}
      </button>
    );
  }
  return <span className={tokenClassName(token)}>{token.text}</span>;
}

export function Tokens({ tokens }: { tokens: Token[] }) {
  return (
    <>
      {tokens.map((token, index) => (
        <TokenItem key={`${index}-${token.text}`} token={token} />
      ))}
    </>
  );
}
