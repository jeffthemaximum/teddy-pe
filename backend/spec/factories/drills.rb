FactoryBot.define do
  factory :drill do
    sequence(:slug) { |n| "drill-#{n}" }
    name { "Drill" }
    area_name { "Strength & Resilience" }
    aliases { [] }
    short { "A drill." }
    how { [ "Do the drill." ] }
  end
end
