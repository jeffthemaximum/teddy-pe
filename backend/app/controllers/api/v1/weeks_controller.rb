module Api
  module V1
    class WeeksController < ApiController
      # GET /api/v1/program_years/:program_year_id/weeks/current
      def current
        year = policy_scope(ProgramYear).find(params[:program_year_id])
        authorize year, :show?

        found = Week.current(year, on: on) || first_week(year)
        return render_not_found if found.nil?

        # WeekPayload walks block, day_cards, and each card's day_role and
        # day_blocks. Preload them here, on the one week this endpoint
        # renders, so it does not fall into the month view's per-record load.
        week = Week.includes(:block, day_cards: [ :day_role, :day_blocks ]).find(found.id)

        render json: WeekPayload.new(week, user: current_user).as_json
      end

      private

      def first_week(year)
        Week.joins(:month_plan).where(month_plans: { program_year_id: year.id })
            .order(:number).first
      end

      def on
        Date.parse(params[:on].to_s)
      rescue ArgumentError, TypeError
        Date.current
      end
    end
  end
end
