FactoryBot.define do
  factory :user do
    sequence(:email) { |n| "person#{n}@example.com" }
    name { Faker::Name.name }
    password { "a-long-enough-password" }
    role { "viewer" }

    trait(:coach)   { role { "coach" } }
    trait(:athlete) { role { "athlete" } }
  end
end
