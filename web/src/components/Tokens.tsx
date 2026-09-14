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
// be tappable and carry a slug (into the Glossary). Every other type,
// including one this file has never seen, still gets its text on screen: a
// renderer that dropped what it did not recognise would lose a day's real
// instructions the first time the API added a token type, and nothing
// would report it.
//
// `onSelectDrill` is a plain callback, not a router hook called in here:
// this file was reviewed and confirmed to port to React Native as-is (a
// flat map, one leaf element per entry, no DOM or CSS dependency lacking a
// native equivalent), and a `useNavigate()` call inside `TokenItem` would
// break that the moment this file tried to render outside a browser router.
// The caller (DayCard, then the screen above it) is the one place that
// knows what tapping a drill actually does; this file only knows that it
// happened, and to which slug.

function tokenClassName(token: Token): string {
  return `token token--${token.style}`;
}

function TokenItem({
  token,
  onSelectDrill,
}: {
  token: Token;
  onSelectDrill?: (slug: string) => void;
}) {
  if (token.type === "drill") {
    return (
      <button
        type="button"
        className={`${tokenClassName(token)} token--drill`}
        data-slug={token.slug}
        onClick={() => {
          // `slug` is optional on Token's own type (see the comment above):
          // `type` is a plain string, not a closed union, so TypeScript
          // cannot narrow "this is a drill token" into "so it has a slug"
          // the way a discriminated union would. A drill token without one
          // is a bad payload, not a tap this file has anything sensible to
          // do with, so it is a no-op rather than calling the handler with
          // undefined.
          if (token.slug) onSelectDrill?.(token.slug);
        }}
      >
        {token.text}
      </button>
    );
  }
  return <span className={tokenClassName(token)}>{token.text}</span>;
}

export function Tokens({
  tokens,
  onSelectDrill,
}: {
  tokens: Token[];
  onSelectDrill?: (slug: string) => void;
}) {
  return (
    <>
      {tokens.map((token, index) => (
        <TokenItem key={`${index}-${token.text}`} token={token} onSelectDrill={onSelectDrill} />
      ))}
    </>
  );
}
