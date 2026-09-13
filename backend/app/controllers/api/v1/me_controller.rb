module Api
  module V1
    class MeController < ApiController
      # GET /api/v1/me
      def show = render json: payload

      # PATCH /api/v1/me
      def update
        # A password change proves it knows the current password. A bearer token
        # alone is not enough, because a stolen one would otherwise be a permanent
        # takeover rather than a 90 day problem.
        if update_params[:password].present? && !current_user.authenticate(params[:user][:current_password].to_s)
          return render_error("unauthorized", "That current password does not match.", :unauthorized)
        end

        # current_password only proves the request; it is not a User column,
        # so it never reaches update! itself.
        current_user.update!(update_params.except(:current_password))
        render json: payload
      end

      private

      def payload
        athlete = athlete_for(current_user)
        {
          user: UserSerializer.new(current_user).as_json,
          athlete: athlete && { id: athlete.id, name: athlete.name, birthday: athlete.birthday },
          current_program_year_id: ProgramYear.current_for(athlete)&.id
        }
      end

      # One athlete today. The schema allows a second, and when there is one this
      # endpoint can no longer guess which child a coach means, so it says nothing
      # rather than serving the wrong one.
      def athlete_for(user)
        return user.athlete if user.athlete
        athletes = Athlete.order(:id).to_a
        athletes.one? ? athletes.first : nil
      end

      # Role is deliberately absent. Nobody promotes themselves.
      def update_params = params.require(:user).permit(:name, :password, :current_password)
    end
  end
end
