class Drill < ApplicationRecord
  validates :slug, presence: true, uniqueness: true
  validates :name, :area_name, :short, presence: true

  scope :alphabetical, -> { order(:name) }

  # Every name and alias, longest first, so the tokenizer matches "bear crawl"
  # before it matches "crawl". Memoised per process because the seeder calls
  # this once per block and the set changes only when content is reseeded.
  def self.terms
    @terms = nil if @terms_generation != generation
    @terms_generation = generation
    @terms ||= pluck(:slug, :name, :aliases)
      .flat_map { |slug, name, aliases| ([ name ] + aliases).map { |t| [ t, slug ] } }
      .sort_by { |term, _| -term.length }
  end

  def self.generation = maximum(:updated_at)&.to_f
end
