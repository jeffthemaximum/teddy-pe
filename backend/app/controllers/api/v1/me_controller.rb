module Api
  module V1
    class MeController < ApiController
      # GET /api/v1/me
      def show = render json: payload

      # PATCH /api/v1/me
      def update
        changing_password = update_params[:password].present?

        # A password change proves it knows the current password. A bearer token
        # alone is not enough, because a stolen one would otherwise be a permanent
        # takeover rather than a 90 day problem. This is a field error on the
        # form, not a dead session, so it answers 422 rather than 401: a wrong
        # current password should not read as a reason to drop to the login
        # screen.
        if changing_password && !current_user.authenticate(params[:user][:current_password].to_s)
          return render_error("wrong_password", "That current password does not match.", :unprocessable_entity)
        end

        # current_password only proves the request; it is not a User column,
        # so it never reaches update! itself.
        current_user.update!(update_params.except(:current_password))

        body = payload
        # A password change just invalidated the token that proved it, via its
        # own fingerprint check, so the caller needs a fresh one to keep working.
        body = body.merge(jwt: JwtService.encode(user: current_user)) if changing_password
        render json: body
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

      # Role is deliberately absent. Nobody promotes themselves.
      def update_params = params.require(:user).permit(:name, :password, :current_password)
    end
  end
end
