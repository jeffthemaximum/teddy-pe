FactoryBot.define do
  factory :test_date do
    program_year
    sequence(:window) { |n| format("2026-%02d", (n % 12) + 1) }
    label { "Fall test" }
    display { "September" }
    starts_on { Date.new(2026, 9, 15) }
    ends_on { Date.new(2026, 9, 17) }
    sequence(:position) { |n| n }
  end
end
