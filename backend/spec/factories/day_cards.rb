FactoryBot.define do
  factory :day_card do
    # Lets a caller build the real chain (week -> month_plan -> block, all on
    # one program year) with one argument, the way
    # `create(:day_card, date: ..., program_year: year)` needs to, without
    # forcing every other caller to build that chain by hand.
    transient do
      program_year { nil }
    end

    week do
      if program_year
        create(:week, month_plan: create(:month_plan, program_year: program_year))
      else
        create(:week)
      end
    end

    date { Date.new(2026, 9, 16) }
    # DayCard validates that dow matches the actual weekday of date, so this
    # has to track whatever date ends up being rather than a fixed string.
    dow { Date.parse(date.to_s).strftime("%a").downcase }
    name { "Fast Day" }
    minutes { "60" }
    intensity { 2 }
    position { 1 }
  end
end
