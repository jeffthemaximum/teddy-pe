FactoryBot.define do
  factory :athlete do
    sequence(:slug) { |n| "athlete-#{n}" }
    name { "Teddy Maxim" }
    birthday { Date.new(2019, 1, 9) }
  end
end
