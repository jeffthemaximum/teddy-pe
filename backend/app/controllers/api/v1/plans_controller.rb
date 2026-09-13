module Api
  module V1
    class PlansController < ApiController
      # GET /api/v1/program_years/:program_year_id/plans/:month
      def show
        year = policy_scope(ProgramYear).find(params[:program_year_id])
        authorize year, :show?

        # Preload what WeekPayload walks per week (block, day cards, and each
        # card's day role and day blocks) so the query count does not grow
        # with the number of weeks in the plan.
        plan = year.month_plans
                   .includes(:block, weeks: [ :block, { day_cards: [ :day_role, :day_blocks ] } ])
                   .find_by!(month: params[:month])

        render json: {
          month: plan.month,
          label: plan.label,
          range_display: plan.range_display,
          block_key: plan.block.key,
          # The month view wants summaries, not full cards. Detail arrives on
          # the week endpoint, which is the screen that uses it.
          weeks: plan.weeks.map { |w| WeekPayload.new(w, user: current_user, detailed: false).as_json }
        }
      end
    end
  end
end
