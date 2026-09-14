module Api
  module V1
    class AuthController < ApiController
      skip_before_action :authorize_request, only: :login

      # Three accounts, a public URL, and passwords nobody is rotating, which
      # makes a guessing run worth more here rather than less: what is behind
      # the login is a seven year old's private journal.
      #
      # bcrypt at the default cost and three Puma threads already hold this to
      # roughly ten guesses a second, by accident. Ten every three minutes is
      # on purpose. Generous for a family of three sharing one home address,
      # useless to anyone working through a list.
      #
      # Counted by address and by attempt, not by failure, so a correct
      # password does not reopen the door for the next thousand guesses. It
      # expires on its own, because a throttle that does not let go locks Jeff
      # out of his own son's program over one bad afternoon.
      rate_limit to: 10, within: 3.minutes, only: :login,
        with: -> {
          render_error("too_many_requests",
                       "Too many sign in attempts. Wait a few minutes and try again.",
                       :too_many_requests)
        }

      # POST /api/v1/auth/login
      def login
        user = User.find_by(email: params[:email].to_s.strip.downcase)

        # Same answer for a wrong password and an unknown email, so this never
        # tells a stranger which addresses have accounts.
        unless user&.authenticate(params[:password].to_s)
          return render_error("unauthorized", "That email and password do not match.", :unauthorized)
        end

        render json: {
          jwt: JwtService.encode(user: user),
          user: UserSerializer.new(user).as_json
        }
      end
    end
  end
end
