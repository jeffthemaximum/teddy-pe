module Api
  module V1
    class AuthController < ApiController
      skip_before_action :authorize_request, only: :login

      # POST /api/v1/auth/login
      def login
        user = User.find_by(email: params[:email].to_s.strip.downcase)

        # Same answer for a wrong password and an unknown email, so this never
        # tells a stranger which addresses have accounts.
        unless user&.authenticate(params[:password].to_s)
          return render_error("unauthorized", "That email and password do not match.", :unauthorized)
        end

        render json: {
          jwt: JwtService.encode(user_id: user.id, password_digest: user.password_digest),
          user: UserSerializer.new(user).as_json
        }
      end
    end
  end
end
