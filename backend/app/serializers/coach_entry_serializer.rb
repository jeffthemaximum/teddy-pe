# One shape for a coach entry, wherever it is served from. /coach_entries and
# the week payload both come through here.
#
# They used to disagree. The week payload dumped the record with as_json, which
# handed out user_id and athlete_id and left out the drill ratings, so the
# journal form it exists to open filled in opened with the half Jeff actually
# taps still empty. spec/requests/weeks_spec.rb compares the two key sets.
#
# user_id and athlete_id stay out. The scope already decided who may see this,
# and the ids add nothing a client can use.
class CoachEntrySerializer < ActiveModel::Serializer
  attributes :id, :session_date, :program_year_id, :day_card_id,
             :overall, :energy, :flag_pain, :pain_note, :note,
             :challenge_num, :ratings, :updated_at

  def ratings = object.drill_ratings.to_h { |r| [ r.drill.slug, r.rating ] }
end
