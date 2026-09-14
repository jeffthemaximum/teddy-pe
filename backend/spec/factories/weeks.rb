FactoryBot.define do
  factory :week do
    month_plan
    block { month_plan.block }
    sequence(:number) { |n| n }
    sequence(:position_in_block) { |n| n }
    theme { "Foundations" }
    dates_display { "Sep 14 to Sep 20" }
    challenge { "Wall rally streak to 20" }
    # Week validates 5 to 6 sub-targets covering all three ball sports.
    targets do
      [
        "Tennis: rally cross court without a miss",
        "Basketball: two hand dribble control",
        "Soccer: first touch out of the air",
        "Balance: single leg landings",
        "Core: hollow body hold",
      ]
    end
  end
end
