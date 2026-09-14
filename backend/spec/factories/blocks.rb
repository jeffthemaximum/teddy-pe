FactoryBot.define do
  factory :block do
    program_year
    sequence(:key) { |n| "block-#{n}" }
    sequence(:name) { |n| "Block #{n}" }
    sequence(:position) { |n| n }
    starts_on { Date.new(2026, 9, 14) }
    ends_on { Date.new(2027, 8, 15) }
  end
end
