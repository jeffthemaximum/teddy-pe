module Api
  module V1
    class TestResultsController < ApiController
      # GET /api/v1/test_results?program_year_id=
      def index
        authorize TestResult
        results = policy_scope(TestResult).includes(:battery_measure, :test_date)
        results = results.where(program_year_id: params[:program_year_id]) if params[:program_year_id]
        render json: { test_results: results.map { |r| serialize(r) } }
      end

      # POST /api/v1/test_results
      def create
        authorize TestResult
        year = ProgramYear.find(result_params.fetch(:program_year_id))
        date = year.test_dates.find_by!(window: result_params.fetch(:window))
        measure = year.battery_measures.find_by!(test_id: result_params.fetch(:test_id))

        value = result_params[:value].to_s.strip

        # Clearing a box deletes the row, so a mistyped number can be taken back.
        if value.empty?
          TestResult.where(program_year: year, test_date: date, battery_measure: measure).destroy_all
          return render json: { deleted: true, test_id: measure.test_id, window: date.window }
        end

        result = TestResult.upsert_for(program_year: year, test_date: date,
                                       battery_measure: measure, value: value, user: current_user)
        render json: { test_result: serialize(result) }
      end

      private

      def result_params
        params.require(:test_result).permit(:program_year_id, :window, :test_id, :value)
      end

      # recorded_at is when the measurement was taken. updated_at is when this
      # row was last written, which is the one the offline queue needs: a
      # replay from a phone that has been offline two days lands on the same
      # row by design, and without a stamp neither end can tell it overwrote
      # something newer.
      def serialize(result)
        { id: result.id, window: result.test_date.window, test_id: result.battery_measure.test_id,
          raw_value: result.raw_value, numeric_value: result.numeric_value&.to_s,
          recorded_at: result.recorded_at, updated_at: result.updated_at }
      end
    end
  end
end
