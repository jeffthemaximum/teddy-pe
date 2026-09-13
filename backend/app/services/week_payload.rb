# One week with its full day cards. Task 12 adds the coach and athlete entries
# for each date, so the journal form opens filled in rather than fetching again.
class WeekPayload
  def initialize(week, user: nil, detailed: true)
    @week = week
    @user = user
    @detailed = detailed
  end

  def as_json(*)
    # The controllers preload what this walks (block, day_cards, and each
    # card's day_role and day_blocks). Reaching for day_cards once here,
    # rather than once for the sum and again for the days array, is what
    # keeps that preload from being undone by a second, un-preloaded load.
    cards = @week.day_cards.to_a

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
      high_intent_efforts: cards.sum(&:hie),
      budget: @week.budget,
      days: cards.map { |c| day(c) }
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
      end,
      coach_entry: entry_for(CoachEntry, card),
      athlete_entry: entry_for(AthleteEntry, card)
    )
  end

  # Whatever the current user is allowed to see for this date, so the journal
  # form opens filled in rather than fetching a second time. The policy scope
  # does the filtering, which is how an unshared entry is absent rather than
  # hidden. Loaded once per klass for the whole week, not once per card, so a
  # seven day week costs two queries rather than fourteen.
  def entry_for(klass, card)
    return nil if @user.nil?
    entry = entries_by_date(klass)[card.date]
    entry && entry.as_json(except: %i[created_at updated_at])
  end

  def entries_by_date(klass)
    @entries_by_date ||= {}
    @entries_by_date[klass] ||= Pundit.policy_scope!(@user, klass)
      .where(program_year_id: @week.month_plan.program_year_id, session_date: @week.day_cards.map(&:date))
      .index_by(&:session_date)
  end
end
