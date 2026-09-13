module Api
  module V1
    class ProgressionController < ApiController
      # GET /api/v1/progression
      def show
        athlete = current_user.athlete || Athlete.first
        return render_not_found if athlete.nil?

        authorize athlete, :show?, policy_class: ProgressionPolicy
        render json: ProgressionPayload.new(athlete, user: current_user).as_json
      end
    end
  end
end
