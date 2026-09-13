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

      def serialize(entry)
        { id: entry.id, session_date: entry.session_date, program_year_id: entry.program_year_id,
          day_card_id: entry.day_card_id, felt: entry.felt, best: entry.best,
          hard: entry.hard, note: entry.note, shared: entry.shared }
      end
    end
  end
end
