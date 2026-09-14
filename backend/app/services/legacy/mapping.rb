module Legacy
  # The one place a legacy row is mapped onto this app's rows, and the one
  # place two values are judged to agree.
  #
  # THE THREE MUST AGREE. Legacy::Survey is what a person reads before typing
  # CONFIRM=yes, Legacy::ResultMigrator decides what actually gets written,
  # and Legacy::Verifier gates deleting the only other copy of the rows. If
  # any one of them answers "can this row map?" differently from the other
  # two, the survey under-reports what will not come across, or the verifier
  # calls a correct migration broken, or a correct migration reads clean
  # while rows were silently left behind. Change the rule here or not at all.
  module Mapping
    module_function

    AMBIGUOUS_WINDOW = "more than one program year has this window".freeze
    NO_WINDOW = "no test date with this window".freeze
    NO_MEASURE = "no battery measure with this test id".freeze

    # What a legacy test_result row maps onto, or the reason it maps onto
    # nothing. `reason` is nil exactly when both test_date and measure are
    # present.
    Resolution = Struct.new(:test_date, :measure, :reason, keyword_init: true) do
      def ok? = reason.nil?
    end

    # R9: the unique index on test_dates is (program_year_id, window), so two
    # program years are allowed to carry the same window string. A global
    # TestDate.find_by(window:) would silently pick whichever came first and
    # file the row under the wrong program year. There is only one program
    # year today, so that cannot happen yet, but this is a one-shot migration
    # of numbers nobody can measure again, so the lookup refuses to guess.
    #
    # The measure is asked of the test date's own program year, never of
    # every program year at once, for the same reason.
    def resolve_result(window:, test_id:)
      dates = TestDate.where(window: window).to_a
      return Resolution.new(reason: AMBIGUOUS_WINDOW) if dates.size > 1

      date = dates.first
      return Resolution.new(reason: NO_WINDOW) if date.nil?

      measure = BatteryMeasure.find_by(program_year_id: date.program_year_id, test_id: test_id)
      return Resolution.new(test_date: date, reason: NO_MEASURE) if measure.nil?

      Resolution.new(test_date: date, measure: measure)
    end

    # smallint comes back as an Integer on one side and may be nil on the
    # other, and "" and nil mean the same absence in the old table. Used both
    # when the journal migrator decides whether an entry the new system
    # already holds agrees with the legacy row, and when the verifier decides
    # the same thing afterwards. Those two answers have to be identical or
    # the migrator declines a write the verifier then reports as a conflict.
    def normalise(value)
      return nil if value.nil? || value == ""

      value
    end

    # A legacy table that is not on this connection. Reported by name rather
    # than read as "there was nothing to migrate": the realistic cause is the
    # old rows living in the Vercel Neon database while LEGACY_DATABASE_URL
    # is unset, and a run that reports zeros for that reason looks exactly
    # like a successful migration of an empty table right up until the only
    # copy is deleted.
    def missing_tables(*models)
      models.reject(&:table_present?).map(&:table_name)
    end
  end
end
