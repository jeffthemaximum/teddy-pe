# Writes the database back into docs/ as prose.
#
# This replaces tools/pull.py. The repo is the complete memory of the project,
# and journals, results and plans all have to be readable there before a
# planning session starts.
#
# An athlete entry Teddy has not shared is left out, exactly as it is left out
# of the API. Enforcing the toggle in one place and leaking it in another would
# make it worthless.
#
# A write-only export is a trap: delete the last entry in a month, or delete a
# MonthPlan, and the file it produced would sit on disk forever, stale, with
# no way to tell from the file alone that the database no longer agrees with
# it. So after writing everything this run has for a year, this also prunes
# any journal or plan file *in the directory this export owns* that the run
# did not (re)write. It never reaches outside `journal/<year>/` and
# `plans/<year>/`: `docs/plans/2026-09.md` sits one level up, hand-written,
# and is not this exporter's to touch. `docs/results/` is left alone entirely
# on purpose: a results file is small, always a full rewrite of the year, and
# a stale one for a year nobody deleted results from is a non-event next to
# deleting someone's notes.
class DocsExporter
  RATING_WORDS = { "not_yet" => "not yet", "getting" => "getting there", "owns" => "owns it" }.freeze

  attr_reader :descriptions, :pruned

  def initialize(athlete, root: Rails.root.join("../docs"))
    @athlete = athlete
    @root = Pathname.new(root)
    @written = []
    @descriptions = {}
    @pruned = []
  end

  def export!
    ProgramYear.where(athlete: @athlete).order(:starts_on).each do |year|
      journal_paths = export_journal(year)
      export_results(year)
      plan_paths = export_plans(year)

      prune("journal/#{year.label}", journal_paths)
      prune("plans/#{year.label}", plan_paths)
    end
    @written
  end

  private

  def write(relative, body, description)
    path = @root.join(relative)
    FileUtils.mkdir_p(path.dirname)
    path.write(body.rstrip + "\n")
    @written << path
    @descriptions[path] = description
    path
  end

  # Deletes any *.md file directly inside root/relative_dir that this run did
  # not just write to `keep`. Scoped to that one directory, never recursing
  # up or down, so a sibling file (docs/plans/2026-09.md, one level above
  # docs/plans/<year>/) is never in scope no matter what.
  def prune(relative_dir, keep)
    dir = @root.join(relative_dir)
    return unless dir.directory?

    Dir.glob(dir.join("*.md")).each do |file|
      path = Pathname.new(file)
      next if keep.include?(path)

      path.delete
      @pruned << path
    end
  end

  def cards_by_date(year)
    @cards ||= {}
    @cards[year.id] ||= DayCard.joins(week: :month_plan)
                               .where(month_plans: { program_year_id: year.id })
                               .index_by(&:date)
  end

  # ---- journals -----------------------------------------------------------

  # A month gets a file whenever anything happened that month, whether or not
  # it is visible: an unshared entry still marks the month as lived, it just
  # contributes nothing to what gets written. Only the visible entries (every
  # coach entry, plus an athlete entry Teddy has shared) ever reach `lines`.
  #
  # A month with no entries left at all (every entry that month deleted)
  # writes nothing here, which is exactly the signal `export!` needs to prune
  # its stale file: the two rules are opposite sides of the same list.
  #
  # Ordered explicitly by session_date then id rather than left to whatever
  # order Postgres happens to return: today one coach and one athlete can
  # never collide on a single date, so nothing currently depends on this, but
  # a second coach account would make output order an accident of physical
  # row placement instead of a fact about the data.
  def export_journal(year)
    coach_entries = CoachEntry.where(program_year: year).includes(drill_ratings: :drill)
                              .order(:session_date, :id).to_a
    athlete_entries = AthleteEntry.where(program_year: year).order(:session_date, :id).to_a
    return [] if coach_entries.empty? && athlete_entries.empty?

    visible = coach_entries + athlete_entries.select(&:shared)
    months = (coach_entries + athlete_entries).map { |e| e.session_date.strftime("%Y-%m") }.uniq.sort
    by_month = visible.group_by { |e| e.session_date.strftime("%Y-%m") }

    months.map do |month|
      entries = by_month[month] || []
      lines = [ "# Journal, #{month}", "", "Athlete: #{@athlete.name}. Program year #{year.label}.", "" ]

      entries.group_by(&:session_date).sort.each do |date, on_that_day|
        card = cards_by_date(year)[date]
        lines << "## #{date} #{card ? "· #{card.name}" : ''}".rstrip
        lines << ""
        on_that_day.sort_by { |e| e.class.name }.each do |entry|
          lines.concat(entry.is_a?(CoachEntry) ? coach_lines(entry) : athlete_lines(entry))
        end
      end

      write("journal/#{year.label}/#{month}.md", lines.join("\n"), "#{entries.size} entr#{entries.size == 1 ? 'y' : 'ies'}")
    end
  end

  def coach_lines(entry)
    lines = [ "**Coach.**" ]
    lines << "How it went: #{entry.overall}/5. Energy: #{entry.energy}/5." if entry.overall || entry.energy
    lines << "Pain flagged. #{entry.pain_note}".strip if entry.flag_pain
    lines << "Challenge number: #{entry.challenge_num}" if entry.challenge_num.present?
    lines << entry.note if entry.note.present?

    ratings = entry.drill_ratings.sort_by { |r| r.drill.name }
    if ratings.any?
      lines << ""
      lines << "Drills:"
      ratings.each { |r| lines << "- #{r.drill.slug}: #{r.rating} (#{RATING_WORDS[r.rating]})" }
    end
    lines << ""
    lines
  end

  def athlete_lines(entry)
    lines = [ "**Teddy.** Shared with Dad." ]
    lines << "How it felt: #{entry.felt}/5." if entry.felt
    lines << "Best thing: #{entry.best}" if entry.best.present?
    lines << "Hard thing: #{entry.hard}" if entry.hard.present?
    lines << entry.note if entry.note.present?
    lines << ""
    lines
  end

  # ---- results ------------------------------------------------------------
  #
  # Not pruned, and not scoped to a keep-list: a results file is one full
  # rewrite of the whole year every run, so it is never stale in the way a
  # journal or plan file can be.

  def export_results(year)
    results = TestResult.where(program_year: year).includes(:test_date, :battery_measure)
    windows = year.test_dates.to_a
    measures = year.battery_measures.to_a

    lines = [ "# Test results, #{year.label}", "", "Athlete: #{@athlete.name}.", "" ]
    lines << "| Test | Unit | Progress is | " + windows.map(&:label).join(" | ") + " |"
    lines << "|---|---|---|" + ([ "---" ] * windows.size).join("|") + "|"

    by_key = results.index_by { |r| [ r.battery_measure_id, r.test_date_id ] }
    measures.each do |measure|
      cells = windows.map { |w| by_key[[ measure.id, w.id ]]&.raw_value || "" }
      lines << "| #{measure.label} | #{measure.unit} | #{measure.direction} | #{cells.join(' | ')} |"
    end

    total = measures.size * windows.size
    write("results/#{year.label}.md", lines.join("\n"), "#{results.size} of #{total} results recorded")
  end

  # ---- plans --------------------------------------------------------------

  def export_plans(year)
    year.month_plans.includes(weeks: { day_cards: :day_blocks }).map do |plan|
      lines = [ "# #{plan.label} (#{plan.range_display})", "" ]
      day_card_count = 0

      plan.weeks.each do |week|
        lines << "## Week #{week.number}: #{week.theme} (#{week.dates_display})"
        lines << ""
        lines << "Sub-targets: #{week.targets.join('; ')}"
        lines << ""
        lines << "Challenge of the week: #{week.challenge}"
        lines << ""
        lines << "High-intent efforts: #{week.high_intent_efforts} of #{week.budget}."
        lines << ""
        week.day_cards.each do |card|
          lines.concat(card_lines(card))
          day_card_count += 1
        end
      end

      description = "#{plan.weeks.size} week#{plan.weeks.size == 1 ? '' : 's'}, #{day_card_count} day card#{day_card_count == 1 ? '' : 's'}"
      write("plans/#{year.label}/#{plan.month}.md", lines.join("\n"), description)
    end
  end

  def card_lines(card)
    minutes = card.minutes == "off" ? "home off" : "#{card.minutes} min"
    lines = [ "### #{card.dow.capitalize} #{card.date} · #{card.day_role&.name} · #{card.name} (#{minutes}, high-intent efforts: #{card.hie})", "" ]

    if card.day_blocks.any?
      card.day_blocks.each do |block|
        tag = { "test" => " [battery]", "challenge" => " [challenge]" }[block.tag].to_s
        body = plain(block.body_tokens)
        lines << "- **#{plain(block.name_tokens)}#{tag}** (#{block.minutes})#{body.present? ? ": #{body}" : ''}"
      end
    else
      card.summary_lines.each { |line| lines << "- #{line}" }
    end

    lines << ""
    lines << "Dad notes: #{card.dad_note}" if card.dad_note.present?
    lines << ""
    lines
  end

  # Tokens back to plain prose, not the raw name/body columns. The raw text
  # still carries the <b>/<q> markup the tokenizer strips out (see
  # BodyTokenizer): it exists so a client can style a phrase, not so a reader
  # sees the tags. Tokens are what's actually rendered, so they are also what
  # belongs in a prose export. This is a join back to text, never a strip:
  # the markup never existed as plain characters in the token stream.
  def plain(tokens) = Array(tokens).map { |t| t["text"] }.join
end
