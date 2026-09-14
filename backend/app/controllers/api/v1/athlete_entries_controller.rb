module Api
  module V1
    class AthleteEntriesController < ApiController
      # GET /api/v1/athlete_entries
      def index
        authorize AthleteEntry
        entries = policy_scope(AthleteEntry).order(:session_date)
        render json: { athlete_entries: entries.map { |e| serialize(e) } }
      end

      # GET /api/v1/athlete_entries/:id
      def show
        entry = policy_scope(AthleteEntry).find(params[:id])
        authorize entry
        render json: { athlete_entry: serialize(entry) }
      end

      # POST /api/v1/athlete_entries
      def create
        authorize AthleteEntry
        year = ProgramYear.find(entry_params.fetch(:program_year_id))

        entry = AthleteEntry.upsert_for(
          user: current_user, program_year: year,
          session_date: entry_params.fetch(:session_date),
          attrs: entry_params.except(:program_year_id, :session_date)
        )

        render json: { athlete_entry: serialize(entry) }
      end

      # PATCH /api/v1/athlete_entries/:id
      def update
        entry = policy_scope(AthleteEntry).find(params[:id])
        authorize entry
        entry.update!(entry_params.except(:program_year_id, :session_date))
        render json: { athlete_entry: serialize(entry) }
      end

      # DELETE /api/v1/athlete_entries/:id
      #
      # Nothing leaves the database. The row keeps every word and every read
      # path stops showing it, which is the whole of Jeff's ruling.
      #
      # policy_scope first, then authorize, the same two steps update takes.
      # The scope already excludes a deleted entry, so deleting one twice is
      # a 404 rather than a second stamp: a replayed offline delete is
      # harmless, and the first delete's timestamp is the true one.
      #
      # The answer is deliberately not an entry envelope. A client that got
      # `{athlete_entry: ...}` back would fold the entry it just deleted
      # straight back into its own state.
      def destroy
        entry = policy_scope(AthleteEntry).find(params[:id])
        authorize entry
        entry.soft_delete!
        render json: { deleted: { id: entry.id, session_date: entry.session_date } }
      end

      private

      def entry_params
        params.require(:athlete_entry).permit(
          :program_year_id, :session_date, :felt, :best, :hard, :note, :shared
        )
      end

      # AthleteEntrySerializer, not a hash written here, because WeekPayload
      # serves the same record and the two had drifted apart.
      def serialize(entry) = AthleteEntrySerializer.new(entry).as_json
    end
  end
end
