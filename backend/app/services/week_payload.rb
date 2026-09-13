# One week with its full day cards. Task 12 adds the coach and athlete entries
# for each date, so the journal form opens filled in rather than fetching again.
class WeekPayload
  def initialize(week, user: nil, detailed: true)
    @week = week
    @user = user
    @detailed = detailed
  end

  def as_json(*)
    {
      id: @week.id,
      number: @week.number,
      position_in_block: @week.position_in_block,
      theme: @week.theme,
      dates_display: @week.dates_display,
      targets: @week.targets,
      challenge: @week.challenge,
      trials: @week.trials,
      block_key: @week.block.key,
      high_intent_efforts: @week.high_intent_efforts,
      budget: @week.budget,
      days: @week.day_cards.includes(:day_blocks, :day_role).map { |c| day(c) }
    }
  end

  private

  def day(card)
    base = {
      id: card.id,
      dow: card.dow,
      date: card.date,
      name: card.name,
      role: card.day_role&.name,
      minutes: card.minutes,
      intensity: card.intensity,
      hie: card.hie,
      summary_lines: card.summary_lines,
      drill_slugs: card.drill_slugs
    }
    return base unless @detailed

    base.merge(
      dad_note: card.dad_note,
      blocks: card.day_blocks.map do |b|
        { id: b.id, position: b.position, minutes: b.minutes, name: b.name,
          tag: b.tag, name_tokens: b.name_tokens, body_tokens: b.body_tokens,
          drill_slugs: b.drill_slugs }
      end
    )
  end
end
