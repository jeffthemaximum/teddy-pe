FactoryBot.define do
  factory :battery_measure do
    program_year
    sequence(:test_id) { |n| "t#{n}" }
    sequence(:position) { |n| n }
    label { "Broad jump" }
    unit { "cm" }
    direction { "higher" }
  end
end
