module Api
  module V1
    class ProgressionController < ApiController
      # GET /api/v1/progression
      def show
        # ApiController#athlete_for, the same resolution /me uses. It refuses
        # to guess once there is a second child rather than taking the first.
        athlete = athlete_for(current_user)
        return render_not_found if athlete.nil?

        authorize athlete, :show?, policy_class: ProgressionPolicy
        render json: ProgressionPayload.new(athlete, user: current_user).as_json
      end
    end
  end
end
