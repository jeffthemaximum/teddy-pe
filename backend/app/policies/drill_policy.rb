# Drills are program content. Everyone signed in reads them, nobody writes
# them through the API, because the repo owns the program.
class DrillPolicy < ApplicationPolicy
  def index? = read_program?
  def show?  = read_program?

  class Scope < Scope
    def resolve = user ? scope.all : scope.none
  end
end
