require "rails_helper"

RSpec.describe Drill do
  describe ".terms" do
    # Task 9's tokenizer matches drill names inside card prose, and it takes
    # the first term that matches at a position. So "bear crawl" has to be
    # offered before "crawl", or the longer drill never matches at all. The
    # ordering is the contract, not an implementation detail.
    it "offers a longer term before a shorter one it contains" do
      create(:drill, slug: "crawl", name: "crawl")
      create(:drill, slug: "bear-crawl", name: "bear crawl")

      terms = described_class.terms.map(&:first)
      expect(terms.index("bear crawl")).to be < terms.index("crawl")
    end

    it "includes aliases, not only names" do
      create(:drill, slug: "hollow-hold", name: "hollow hold", aliases: [ "hollow holds" ])

      expect(described_class.terms).to include([ "hollow holds", "hollow-hold" ])
    end

    it "pairs every term with its own drill's slug" do
      create(:drill, slug: "a-march", name: "A-march", aliases: [ "a march" ])

      slugs = described_class.terms.select { |term, _| term.start_with?("A-march", "a march") }.map(&:last)
      expect(slugs.uniq).to eq([ "a-march" ])
    end

    it "returns nothing when there are no drills" do
      expect(described_class.terms).to eq([])
    end

    it "sorts strictly longest first across the real seeded set" do
      ContentSeeder.new(year_label: "2026-27").seed!

      lengths = described_class.terms.map { |term, _| term.length }
      expect(lengths).to eq(lengths.sort.reverse)
    end
  end
end
