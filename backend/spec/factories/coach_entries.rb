FactoryBot.define do
  factory :coach_entry do
    user { create(:user, :coach) }
    athlete { program_year.athlete }
    program_year { ProgramYear.first || create(:program_year) }
    session_date { Date.new(2026, 9, 17) }
    overall { 4 }
    energy { 4 }
    note { "Good session." }

    # Same as the athlete factory's: the column is set here directly, not by
    # calling the code the specs are checking.
    trait(:deleted) { deleted_at { Time.utc(2026, 9, 18, 9, 0, 0) } }
  end
end
