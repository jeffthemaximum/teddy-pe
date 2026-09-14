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

      # DELETE /api/v1/coach_entries/:id
      #
      # Same shape and same rules as the athlete's, including the answer:
      # `{deleted: ...}` rather than an entry envelope, so nothing folds the
      # deleted entry back into the state it was just removed from. The drill
      # ratings ride along with the row and stay exactly where they are.
      def destroy
        entry = policy_scope(CoachEntry).find(params[:id])
        authorize entry
        entry.soft_delete!
        render json: { deleted: { id: entry.id, session_date: entry.session_date } }
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

      # CoachEntrySerializer, not a hash written here, because WeekPayload
      # serves the same record and the two had drifted apart.
      def serialize(entry) = CoachEntrySerializer.new(entry).as_json
    end
  end
end
