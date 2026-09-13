FactoryBot.define do
  factory :coach_entry do
    user { create(:user, :coach) }
    athlete { program_year.athlete }
    program_year { ProgramYear.first || create(:program_year) }
    session_date { Date.new(2026, 9, 17) }
    overall { 4 }
    energy { 4 }
    note { "Good session." }
  end
end
