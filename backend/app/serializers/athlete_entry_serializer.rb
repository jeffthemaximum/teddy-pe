# One shape for Teddy's entry, wherever it is served from. /athlete_entries and
# the week payload both come through here.
#
# shared is part of the record and stays in the payload: the form has to open
# with the switch showing where Teddy left it, or saving the form back flips it.
class AthleteEntrySerializer < ActiveModel::Serializer
  attributes :id, :session_date, :program_year_id, :day_card_id,
             :felt, :best, :hard, :note, :shared
end
