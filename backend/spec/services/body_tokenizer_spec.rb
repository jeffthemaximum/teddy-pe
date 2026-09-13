require "rails_helper"

RSpec.describe BodyTokenizer do
  # Longest first, the way Drill.terms hands them over.
  let(:terms) do
    [ [ "bear crawl", "bear-crawl" ], [ "split step", "split-step" ],
      [ "crawl", "crawl" ], [ "pass", "pass" ] ].sort_by { |t, _| -t.length }
  end
  let(:tokenizer) { described_class.new(terms) }

  def tokenize(name: "", body: "") = tokenizer.tokenize(name: name, body: body)

  it "wraps a drill it finds in the prose" do
    result = tokenize(body: "Then a bear crawl across the mat.")
    expect(result[:body_tokens]).to eq([
      { "type" => "text",  "style" => "plain", "text" => "Then a " },
      { "type" => "drill", "style" => "plain", "text" => "bear crawl", "slug" => "bear-crawl" },
      { "type" => "text",  "style" => "plain", "text" => " across the mat." }
    ])
    expect(result[:drill_slugs]).to eq([ "bear-crawl" ])
  end

  it "prefers the longest term, so bear crawl beats crawl" do
    expect(tokenize(body: "bear crawl")[:drill_slugs]).to eq([ "bear-crawl" ])
  end

  it "tolerates a plural" do
    expect(tokenize(body: "Ten split steps on the clap.")[:drill_slugs]).to eq([ "split-step" ])
  end

  it "never matches inside a longer word" do
    expect(tokenize(body: "Inside-foot passing at 3m.")[:drill_slugs]).to eq([])
  end

  it "links only the first mention in a block" do
    result = tokenize(body: "A bear crawl, then another bear crawl.")
    expect(result[:drill_slugs]).to eq([ "bear-crawl" ])
    expect(result[:body_tokens].count { |t| t["type"] == "drill" }).to eq(1)
  end

  it "treats the block title and the body as one unit, linking on the title" do
    result = tokenize(name: "Split step drill", body: "Ten split steps.")
    expect(result[:name_tokens].any? { |t| t["type"] == "drill" }).to be(true)
    expect(result[:body_tokens].none? { |t| t["type"] == "drill" }).to be(true)
    expect(result[:drill_slugs]).to eq([ "split-step" ])
  end

  it "carries bold and quote through as a style rather than as markup" do
    result = tokenize(body: "<b>Test: bear crawl</b> then <q>land like a cat</q>.")
    bolded = result[:body_tokens].select { |t| t["style"] == "bold" }
    expect(bolded.map { |t| t["text"] }).to eq([ "Test: ", "bear crawl" ])
    expect(result[:body_tokens].find { |t| t["style"] == "quote" }["text"]).to eq("land like a cat")
    expect(result[:body_tokens].map { |t| t["text"] }.join).not_to include("<")
  end

  it "matches whatever the case is" do
    expect(tokenize(body: "Bear Crawl to the cone.")[:drill_slugs]).to eq([ "bear-crawl" ])
  end

  it "returns no tokens for empty prose" do
    expect(tokenize(body: "")[:body_tokens]).to eq([])
    expect(tokenize(body: "")[:drill_slugs]).to eq([])
  end

  it "loses no text, whatever it does with it" do
    body = "<b>Test: bear crawl</b> then ten split steps and a pass."
    rebuilt = tokenize(body: body)[:body_tokens].map { |t| t["text"] }.join
    expect(rebuilt).to eq("Test: bear crawl then ten split steps and a pass.")
  end
end
