module Api
  module V1
    class ProgramYearsController < ApiController
      # GET /api/v1/program_years
      def index
        authorize ProgramYear
        years = policy_scope(ProgramYear).order(starts_on: :desc)
        current = ProgramYear.current_for(years.first&.athlete, on: on)

        render json: {
          program_years: years.map do |y|
            { id: y.id, label: y.label, starts_on: y.starts_on, ends_on: y.ends_on,
              status: y.status, is_current: y.id == current&.id }
          end
        }
      end

      # GET /api/v1/program_years/:id
      def show
        year = policy_scope(ProgramYear).find(params[:id])
        authorize year
        render json: ProgramYearPayload.new(year, on: on).as_json
      end

      private

      # A date can be asked for, so the clients can look at any week of any
      # year without a second endpoint and without anything being hardcoded.
      def on
        Date.parse(params[:on].to_s)
      rescue ArgumentError, TypeError
        Date.current
      end
    end
  end
end
