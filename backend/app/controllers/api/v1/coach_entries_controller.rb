module Api
  module V1
    class CoachEntriesController < ApiController
      # GET /api/v1/coach_entries?from=&to=
      def index
        authorize CoachEntry
        entries = policy_scope(CoachEntry).includes(drill_ratings: :drill).order(:session_date)
        entries = entries.between(params[:from], params[:to]) if params[:from] && params[:to]
        render json: { coach_entries: entries.map { |e| serialize(e) } }
      end

      # POST /api/v1/coach_entries
      # Upserts on (author, year, session date), so a second device and a
      # replayed offline write land on the same row.
      def create
        authorize CoachEntry
        year = ProgramYear.find(entry_params.fetch(:program_year_id))

        entry = CoachEntry.upsert_for(
          user: current_user, program_year: year,
          session_date: entry_params.fetch(:session_date),
          attrs: entry_params.except(:program_year_id, :session_date),
          ratings: ratings_param
        )

        render json: { coach_entry: serialize(entry) }
      end

      # PATCH /api/v1/coach_entries/:id
      def update
        entry = policy_scope(CoachEntry).find(params[:id])
        authorize entry
        CoachEntry.transaction do
          entry.update!(entry_params.except(:program_year_id, :session_date))
          entry.replace_ratings!(ratings_param) if ratings_param
        end
        render json: { coach_entry: serialize(entry) }
      end

      private

      def entry_params
        params.require(:coach_entry).permit(
          :program_year_id, :session_date, :overall, :energy,
          :flag_pain, :pain_note, :note, :challenge_num
        )
      end

      # A slug that is not a drill is dropped rather than failing the save, so
      # a stale client never costs Jeff an entry. A bad rating still fails,
      # because that is a real mistake worth surfacing.
      def ratings_param
        raw = params[:ratings]
        return nil if raw.blank? || !raw.respond_to?(:to_unsafe_h)
        raw.to_unsafe_h.select { |slug, _| slug.to_s.match?(/\A[a-z0-9-]{1,64}\z/) }
      end

      def serialize(entry)
        {
          id: entry.id, session_date: entry.session_date, program_year_id: entry.program_year_id,
          day_card_id: entry.day_card_id, overall: entry.overall, energy: entry.energy,
          flag_pain: entry.flag_pain, pain_note: entry.pain_note, note: entry.note,
          challenge_num: entry.challenge_num,
          ratings: entry.drill_ratings.to_h { |r| [ r.drill.slug, r.rating ] }
        }
      end
    end
  end
end
