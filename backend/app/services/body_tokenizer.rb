# Turns a day block's prose into a flat token array the clients render.
#
# This is the Ruby port of the linker that lived in build.py. It runs at seed
# time rather than in the clients, so the matching rules exist once and the
# content spec can assert what came out. React Native cannot render an HTML
# string, which is why the output is tokens rather than markup.
#
# The rules, unchanged from build.py:
#   longest term first, so "bear crawl" beats "crawl"
#   word boundaries on both sides, so "pass" never matches inside "passing"
#   a trailing s or es tolerated, so "split steps" finds "split step"
#   case insensitive
#   one link per drill per block, with the title and body sharing the count,
#     so a drill named in both links on the title
class BodyTokenizer
  TAG = /(<\/?[a-z]+>)/i
  STYLE_FOR = { "b" => "bold", "q" => "quote" }.freeze

  def initialize(terms)
    @slug_for = {}
    alternatives = terms.each_with_index.map do |(term, slug), i|
      group = "t#{i}"
      @slug_for[group] = slug
      "(?<#{group}>#{Regexp.escape(term)}(?:e?s)?)"
    end
    @pattern = alternatives.empty? ? nil : /(?<![\w-])(?:#{alternatives.join('|')})(?![\w-])/i
  end

  # Returns { name_tokens:, body_tokens:, drill_slugs: } with drill_slugs in
  # first-mention order across the title and then the body.
  def tokenize(name:, body:)
    found = []
    name_tokens = tokens_for(name.to_s, found)
    body_tokens = tokens_for(body.to_s, found)
    { name_tokens: name_tokens, body_tokens: body_tokens, drill_slugs: found }
  end

  private

  def tokens_for(text, found)
    return [] if text.empty?

    styles = []
    text.split(TAG).each_with_object([]) do |part, out|
      next if part.empty?

      if (tag = part[/\A<(\/?)([a-z]+)>\z/i, 2]&.downcase)
        closing = part.start_with?("</")
        style = STYLE_FOR[tag]
        next if style.nil?
        closing ? styles.pop : styles.push(style)
        next
      end

      out.concat(link(part, styles.last || "plain", found))
    end
  end

  def link(part, style, found)
    spans = accepted_spans(part, found)
    return [ text_token(part, style) ].compact if spans.empty?

    out = []
    cursor = 0
    spans.each do |from, to, slug|
      out << text_token(part[cursor...from], style)
      out << { "type" => "drill", "style" => style, "text" => part[from...to], "slug" => slug }
      cursor = to
    end
    out << text_token(part[cursor..], style)
    out.compact
  end

  # Scans left to right, keeping only the first mention of each drill. A repeat
  # stays plain text rather than becoming a second link.
  def accepted_spans(part, found)
    return [] if @pattern.nil?

    spans = []
    pos = 0
    while (match = @pattern.match(part, pos))
      group = match.names.find { |n| match[n] }
      slug  = @slug_for[group]
      unless found.include?(slug)
        found << slug
        spans << [ match.begin(0), match.end(0), slug ]
      end
      pos = match.end(0)
    end
    spans
  end

  def text_token(string, style)
    return nil if string.nil? || string.empty?
    { "type" => "text", "style" => style, "text" => string }
  end
end
