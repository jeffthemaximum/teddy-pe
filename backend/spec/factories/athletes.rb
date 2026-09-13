FactoryBot.define do
  factory :athlete do
    sequence(:slug) { |n| n == 1 ? "teddy" : "athlete-#{n}" }
    name { "Teddy Maxim" }
    birthday { Date.new(2019, 1, 9) }
  end
end
