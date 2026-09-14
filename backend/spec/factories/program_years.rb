FactoryBot.define do
  factory :program_year do
    athlete
    sequence(:label) { |n| "20#{25 + n}-#{(26 + n) % 100}" }
    starts_on { Date.new(2026, 9, 14) }
    ends_on { Date.new(2027, 8, 15) }
    status { "active" }
    ball_now { "green" }
  end
end
