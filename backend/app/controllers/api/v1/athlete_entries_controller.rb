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
