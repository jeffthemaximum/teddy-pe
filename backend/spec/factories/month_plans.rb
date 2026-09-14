FactoryBot.define do
  factory :month_plan do
    program_year
    # The block belongs to the same program year as the month plan, the way
    # real content requires (month_plans.program_year_id and blocks.program_year_id
    # are the two halves of one year). Passing an explicit program_year to the
    # month plan carries it down to a matching block automatically.
    block { create(:block, program_year: program_year) }
    sequence(:month) { |n| format("2026-%02d", (n % 12) + 1) }
    label { "September" }
    range_display { "Sep 14 to Sep 30" }
  end
end
