module Api
  module V1
    class MeController < ApiController
      # GET /api/v1/me
      def show = render json: payload

      # PATCH /api/v1/me
      def update
        current_user.update!(update_params)
        render json: payload
      end

      private

      def payload
        athlete = current_user.athlete || Athlete.first
        {
          user: UserSerializer.new(current_user).as_json,
          athlete: athlete && { id: athlete.id, name: athlete.name, birthday: athlete.birthday },
          current_program_year_id: ProgramYear.current_for(athlete)&.id
        }
      end

      # Role is deliberately absent. Nobody promotes themselves.
      def update_params = params.require(:user).permit(:name, :password)
    end
  end
end
