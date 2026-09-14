FactoryBot.define do
  factory :athlete_entry do
    user { create(:user, :athlete) }
    athlete { program_year.athlete }
    program_year { ProgramYear.first || create(:program_year) }
    session_date { Date.new(2026, 9, 17) }
    felt { 5 }
    best { "The cartwheel" }
    shared { false }

    trait(:shared) { shared { true } }

    # Stamped straight onto the row rather than run through soft_delete! or
    # the endpoint, so a spec asserting that a deleted entry is invisible is
    # not asserting it against the same code that hides it.
    trait(:deleted) { deleted_at { Time.utc(2026, 9, 18, 9, 0, 0) } }
  end
end
