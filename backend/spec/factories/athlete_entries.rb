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
  end
end
